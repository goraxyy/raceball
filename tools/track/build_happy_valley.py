"""Run in Blender (including its MCP execute tool) with RACEBALL_ROOT set.

Requires the two approved Kenney packs under assets-src. Creates a dedicated
scene, leaving other scenes intact. Re-running replaces only Happy Valley.
Raw sources stay ignored; only the two runtime GLBs belong in git.
"""

import bpy
import bisect
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(globals().get("RACEBALL_ROOT", Path(bpy.data.filepath).parent.parent))
SRC = ROOT / "assets-src"
SECTIONS = ["start", "pollock", "library", "lionshrine", "creamery", "stadium", "arboretum", "collegeave"]
COLORS = [(0.26, .37, .48, 1), (.51, .36, .28, 1), (.62, .55, .43, 1), (.40, .48, .36, 1), (.70, .51, .47, 1), (.27, .40, .49, 1), (.67, .78, .80, 1), (.31, .36, .45, 1)]
SCALE = 1.15  # stretches the whole layout; 1.15 puts an ideal (autopilot) lap at about 61 s
WIDTH = 12.0
# Each knot is in game X/Z meters. cp_00 faces north, with the grid south of it.
KNOTS = [(0, 0, 0), (0, 45, 0), (0, 85, 1), (14, 112, 1), (-8, 145, 1), (0, 180, 2), (0, 210, 2), (0, 240, 3), (8, 264, 3), (30, 274, 3), (52, 264, 3), (60, 240, 3), (60, 214, 4), (79, 185, 4), (112, 180, 4), (141, 166, 5), (155, 135, 5), (175, 113, 5), (202, 94, 5), (213, 65, 5), (199, 36, 5), (172, 27, 5), (144, 40, 6), (121, 25, 6), (113, -13, 6), (94, -47, 6), (55, -63, 6), (20, -55, 7), (0, -32, 7)]


def catmull(a, b, c, d, t):
    return tuple(.5 * ((2*b[k]) + (-a[k]+c[k])*t + (2*a[k]-5*b[k]+4*c[k]-d[k])*t*t + (-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t) * SCALE for k in (0, 1))


# Fine centerline used to resample geometry at roughly 5 m intervals.
dense = []
starts = [None] * 8
length = 0.0
for i, b in enumerate(KNOTS):
    a, c, d = KNOTS[(i-1) % len(KNOTS)], KNOTS[(i+1) % len(KNOTS)], KNOTS[(i+2) % len(KNOTS)]
    for j in range(50):
        x, z = catmull(a, b, c, d, j/50)
        if dense:
            length += math.hypot(x-dense[-1][1], z-dense[-1][2])
        if j == 0 and starts[b[2]] is None:
            starts[b[2]] = length
        dense.append((length, x, z, b[2]))
length += math.hypot(dense[-1][1], dense[-1][2])
dense.append((length, 0, 0, 0))
distances = [p[0] for p in dense]
ends = starts[1:] + [length]


def center(s):
    s %= length
    i = max(0, bisect.bisect_right(distances, s)-1)
    a, b = dense[i], dense[i+1]
    t = (s-a[0]) / (b[0]-a[0])
    return (a[1] + t*(b[1]-a[1]), a[2]+t*(b[2]-a[2]))


def tangent(s):
    a, b = center(s-.2), center(s+.2)
    d = math.hypot(b[0]-a[0], b[1]-a[1])
    return ((b[0]-a[0])/d, (b[1]-a[1])/d)


def smooth(t):
    t = max(0, min(1, t))
    return t*t*(3-2*t)


steps = [starts[2]+12+i*2.3 for i in range(8)]


def height(s):
    s %= length
    if s < steps[0]: return 0.0
    if s < starts[4]: return .12*sum(s >= q for q in steps)
    if s < starts[5]:
        t = (s-starts[4])/(starts[5]-starts[4])
        # The road climbs the cone plinth and drops off a shallow scoop lip.
        return .96 + 3.0*math.sin(math.pi*t)**2
    if s < starts[6]: return .96 + 5.0*smooth((s-starts[5])/(starts[6]-starts[5]))
    if s < starts[7]: return 5.96*(1-smooth((s-starts[6])/(starts[7]-starts[6])))
    return 0.0


def bank(s):
    t = (s-starts[3])/(starts[4]-starts[3])
    return -.16*math.sin(math.pi*t)**2 if 0 < t < 1 else 0


def xyz(s, side=0, up=0):
    x, z = center(s)
    tx, tz = tangent(s)
    return (x+tz*side, height(s)+bank(s)*side+up, z-tx*side)


def blender(p):
    return (p[0], -p[2], p[1])


old = bpy.data.scenes.get("Happy Valley")
if old:
    for obj in list(old.objects): bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(old)
scene = bpy.data.scenes.new("Happy Valley")
bpy.context.window.scene = scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
collections = {}
for name in ["visual", "collision", "markers"]:
    prior = bpy.data.collections.get(name)
    if prior and prior.users == 0: bpy.data.collections.remove(prior)
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    collections[name] = col


def material(name, rgba):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = .85
    return mat


mats = [material("mat_"+s, c) for s, c in zip(SECTIONS, COLORS)]
white = material("mat_chalk", (.88,.91,.89,1))
navy = material("mat_navy", (.025,.075,.14,1))
green = material("mat_lawn", (.22,.34,.23,1))
orange = material("mat_fall", (.78,.30,.10,1))
ice = material("mat_ice", (.30,.72,.88,1))
pink = material("mat_icecream", (.95,.65,.72,1))
gold = material("mat_cone", (.70,.45,.19,1))
blue = material("mat_boost", (.05,.53,.92,1))


def mesh(name, verts, faces, collection, mat=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([blender(p) for p in verts], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collections[collection].objects.link(obj)
    if mat: data.materials.append(mat)
    return obj


BOX_FACES = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]


def box(name, p, size, mat, collection="visual", heading=0):
    w, h, d = [q/2 for q in size]
    verts = []
    for y in [-h,h]:
        for x,z in [(-w,-d),(w,-d),(w,d),(-w,d)]:
            verts.append((p[0]+x*math.cos(heading)+z*math.sin(heading),p[1]+y,p[2]-x*math.sin(heading)+z*math.cos(heading)))
    return mesh(name, verts, BOX_FACES, collection, mat)


def ribbon(name, samples, left, right, bottom, top, collection, mat=None):
    verts=[]
    for s,h in samples:
        x,z=center(s); tx,tz=tangent(s)
        for side,up in [(left,bottom),(right,bottom),(right,top),(left,top)]:
            verts.append((x+tz*side,h+bank(s)*side+up,z-tx*side))
    faces=[(0,3,2,1)]
    for i in range(len(samples)-1):
        a,b=i*4,(i+1)*4
        faces.extend([(a+j,a+(j+1)%4,b+(j+1)%4,b+j) for j in range(4)])
    a=(len(samples)-1)*4
    faces.append((a,a+1,a+2,a+3))
    return mesh(name,verts,faces,collection,mat)


for section in range(8):
    a,b=starts[section],ends[section]
    sample_s=sorted(set([a,b]+[a+(b-a)*i/math.ceil((b-a)/5) for i in range(1,math.ceil((b-a)/5))]+[q for q in steps if a<q<b]))
    samples=[]
    for s in sample_s:
        if s in steps: samples.append((s,height(s-.001)))
        samples.append((s,height(s)))
    obj=ribbon(SECTIONS[section]+"_road_col",samples,-WIDTH/2,WIDTH/2,-.85,0,"collision")
    if section==2: obj["restitution"]=.5
    obj["section"]=SECTIONS[section]
    ribbon("trk_"+SECTIONS[section],samples,-WIDTH/2,WIDTH/2,-.85,0,"visual",mats[section])
    for side in [-1,1]:
        lo,hi=sorted([side*WIDTH/2,side*(WIDTH/2+.5)])
        ribbon(SECTIONS[section]+f"_rail_{side}_col",samples,lo,hi,-.85,1,"collision")
        ribbon("trk_edge_"+SECTIONS[section]+str(side),samples,lo,hi,-.85,1,"visual",white if section%2==0 else navy)
    # Dashed centerline and section arrows make the loop easy to read in chase view.
    for s in range(math.ceil(a/12)*12,math.floor(b),12):
        tx,tz=tangent(s)
        box("trk_dash",xyz(s,0,.018),(.12,.025,3),white,heading=math.atan2(tx,tz))


def marker(name, rb, s, side=0, up=0, scale=(1,1,1), **props):
    obj=bpy.data.objects.new(name,None)
    collections["markers"].objects.link(obj)
    obj.location=blender(xyz(s,side,up))
    tx,tz=tangent(s)
    obj.rotation_euler[2]=math.atan2(tx,tz)
    obj.scale=(scale[0],scale[2],scale[1])
    obj.empty_display_type="CUBE" if rb in ["checkpoint","boost"] else "ARROWS"
    obj.empty_display_size=1
    obj["rb"]=rb
    for k,v in props.items(): obj[k]=v
    return obj


# A gate on the hairpin exit is the landing gate for the optional ramp.
gate_s=starts[:4]+[starts[4]-9]+starts[4:]
gate_sections=SECTIONS[:4]+["lionshrine"]+SECTIONS[4:]
for i,(s,section) in enumerate(zip(gate_s,gate_sections)):
    gate=marker(f"cp_{i:02}","checkpoint",s,up=2.5,scale=(6.2,3.5,.8),index=i,section=section)
    if i==0: gate.rotation_euler[2]=0
    marker(f"respawn_{i:02}","respawn",s+5,checkpoint=i)
for i in range(8):
    spawn=marker(f"spawn_{i+1}","spawn",0,slot=i+1)
    spawn.location=blender((-.75 if i%2==0 else .75,0,-4-(i//2)*3-(i%2)*1.5))
    spawn.rotation_euler[2]=0
for i,s in enumerate([25,40,ends[7]-35,ends[7]-20]):
    marker(f"boost_{i:02}","boost",s,up=.3,scale=(4,.4,2),power=1.0)
    box("prop_boost",xyz(s,0,.035),(8,.04,4),blue,heading=math.atan2(*tangent(s)))
    for d in [-1,1]: box("prop_boost_stripe",xyz(s+d,0,.06),(6,.03,.25),white,heading=math.atan2(*tangent(s)))
for i,side in enumerate([-4,-2,0,2,4]):
    s=starts[1]+35
    marker(f"item_pollock_{i}","item",s,side,1)
    # no static box: the game draws item boxes itself, so they can hide when hit
for section in [0,3,5,6]:
    marker("cam_"+SECTIONS[section],"camera",starts[section]+20,side=-25,up=20,section=SECTIONS[section])
# The route's centerline for game-core (ranking, bots) and the big-screen TrackMap:
# game-space x, z pairs about every 4 m, starting at the finish line and going the racing way.
route=bpy.data.objects.new("route",None)
collections["markers"].objects.link(route)
route["rb"]="route"
route["length"]=round(length,2)
route_n=math.ceil(length/4)
route["points"]=[round(v,2) for i in range(route_n) for v in center(length*i/route_n)]
for i,(s,side,kind,grip,mat) in enumerate([(starts[4]+35,-2,"icecream",.2,pink),(starts[4]+60,2,"icecream",.2,pink),(starts[6]+30,0,"snow",.6,white),(starts[6]+65,2,"ice",.1,ice),(starts[6]+95,-1,"snow",.6,white)]):
    heading=math.atan2(*tangent(s))
    surf=box(f"surface_{kind}_{i}",xyz(s,side,.5),(6,1.2,8),None,"markers",heading)
    surf["rb"]="surface";surf["kind"]=kind;surf["grip"]=grip
    box("prop_"+kind,xyz(s,side,.045),(6,.05,8),mat,heading=heading)


# Broad optional jump on the inside of the Lion exit. Main road stays continuous.
jump_end=starts[4]-12
jump_start=jump_end-14
jump_samples=[(jump_start,height(jump_start)),(jump_end-3,height(jump_end-3)+1.2)]
ribbon("lionshrine_jump_col",jump_samples,-5,1,-.8,0,"collision")
ribbon("trk_lionshrine_jump",jump_samples,-5,1,-.8,0,"visual",orange)


# Landmarks use deliberately simple boxes at roughly final scale.
def landmark(name, x,z,w,h,d,mat=navy,y=0):
    return box("prop_"+name,(x*SCALE,y+h/2,z*SCALE),(w,h,d),mat)


landmark("old_main",-23,16,24,7,14,mats[2])
landmark("old_main_tower",-23,16,6,18,6,white)
landmark("old_main_roof",-23,16,7,1,7,navy,y=18)
landmark("hub",31,136,24,10,17,mats[1])
landmark("pattee_library",-23,215,28,12,34,mats[2])
for z in [202,210,218,226]: landmark("library_column",-8,z,2,10,2,white)
landmark("lion_shrine_plinth",30,247,13,3,9,mats[2])
landmark("lion_shrine_body",30,247,7,3,3,gold,y=3)
landmark("lion_shrine_head",34,247,3,4,3,gold,y=4)
landmark("creamery",101,201,23,9,14,pink)
landmark("cone_plinth",103,188,15,4,10,gold)
# Cone silhouette alongside the rising road, with scoop above it.
bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=2,radius2=6,depth=12,location=blender((111*SCALE,9,199*SCALE)))
obj=bpy.context.object;obj.name="prop_creamery_cone"
for c in list(obj.users_collection):c.objects.unlink(obj)
collections["visual"].objects.link(obj);obj.data.materials.append(gold)
bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=6,location=blender((111*SCALE,16,199*SCALE)))
obj=bpy.context.object;obj.name="prop_creamery_scoop"
for c in list(obj.users_collection):c.objects.unlink(obj)
collections["visual"].objects.link(obj);obj.data.materials.append(pink)
landmark("stadium_field",175,66,42,.15,52,green,y=.1)
landmark("scoreboard",176,5,21,12,3,navy)
landmark("scoreboard_face",176,3,18,7,.3,white,y=4)
for x,z in [(70,-10),(45,-20),(25,-10)]:landmark("arboretum_snowbank",x,z,15,3,10,white,y=-1)
for x,z,h in [(-22,-28,10),(-23,-43,8),(-36,-40,13)]:landmark("college_storefront",x,z,10,h,11,mats[1])
landmark("mount_nittany",140,-90,65,32,16,mats[3],y=-8)
landmark("mount_nittany_snowcap",140,-90,42,7,17,white,y=24)


# Stadium tunnel: visual and solid portal, with an 8 m high clear opening.
s=starts[5]+20; heading=math.atan2(*tangent(s))
for side in [-7,7]:
    box("prop_tunnel_wall",xyz(s,side,3),(1.2,6,15),navy,heading=heading)
    box(f"stadium_tunnel_wall_{side}_col",xyz(s,side,3),(1.2,6,15),None,"collision",heading)
box("prop_tunnel_roof",xyz(s,0,7),(16,1,15),white,heading=heading)
box("stadium_tunnel_roof_col",xyz(s,0,7),(16,1,15),None,"collision",heading)


def label(text,p,size=3):
    data=bpy.data.curves.new("label","FONT");data.body=text;data.size=size;data.align_x="CENTER";data.extrude=.015
    obj=bpy.data.objects.new("prop_label_"+text.lower().replace(" ","_"),data)
    collections["visual"].objects.link(obj);obj.location=blender(p)
    data.materials.append(white)
    # Flat labels are readable from overview; landmarks carry the chase-view silhouette.
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target="MESH");obj.select_set(False)


for text,x,z in [("OLD MAIN",-24,6),("POLLOCK",30,123),("LIBRARY",-25,192),("LION SHRINE",31,230),("CREAMERY",103,215),("BEAVER STADIUM",174,78),("ARBORETUM",68,-27),("COLLEGE AVE",-27,-56)]:
    label(text,(x*SCALE,20 if text=="OLD MAIN" else 14,z*SCALE),2.7)


# Import a few actual CC0 kit pieces; reusable templates are removed after placement.
def kenney_template(relative,name):
    path=SRC/relative
    if not path.exists(): return None
    before=set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects=[o for o in scene.objects if o not in before]
    meshes=[o for o in objects if o.type=="MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    transform=obj.matrix_world.copy()
    obj.parent=None
    obj.data.transform(transform)
    obj.matrix_world.identity()
    bounds=[v.co for v in obj.data.vertices]
    low=Vector([min(v[i] for v in bounds) for i in range(3)])
    high=Vector([max(v[i] for v in bounds) for i in range(3)])
    offset=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    for v in obj.data.vertices:v.co-=offset
    for c in list(obj.users_collection):c.objects.unlink(obj)
    collections["visual"].objects.link(obj)
    obj.name=name
    for o in objects:
        if o!=obj and o.name in bpy.data.objects: bpy.data.objects.remove(o,do_unlink=True)
    return obj


def instance(template,name,p,scale,heading=0):
    if template is None:return
    obj=template.copy();obj.data=template.data
    collections["visual"].objects.link(obj);obj.name=name
    obj.location=blender(p);obj.scale=scale;obj.rotation_euler[2]=heading
    return obj


tree=kenney_template("kenney-marble-kit/Models/GLB format/tree-large.glb","template_tree")
arch=kenney_template("kenney-racing-kit/Models/GLTF format/overhead.glb","template_arch")
stand=kenney_template("kenney-racing-kit/Models/GLTF format/grandStand.glb","template_stand")
barrier=kenney_template("kenney-racing-kit/Models/GLTF format/barrierRed.glb","template_barrier")
for i in range(40):
    s=length*i/40;side=13 if i%2 else -14
    instance(tree,"prop_kenney_tree",xyz(s,side), (3,3,3.5))
instance(arch,"prop_kenney_finish_arch",(0,0,0),(12,12,12))
for x,z,heading in [(226,52,math.pi/2),(226,70,math.pi/2),(226,88,math.pi/2),(151,8,0),(173,8,0),(195,8,0)]:
    instance(stand,"prop_kenney_grandstand",(x*SCALE,.96,z*SCALE),(14,14,10),heading)
for s in range(12,72,10):
    instance(barrier,"prop_kenney_barrier",xyz(s,7),(7,7,7))
for obj in [tree,arch,stand,barrier]:
    if obj:bpy.data.objects.remove(obj,do_unlink=True)


# Keep draw calls bounded: merge static meshes sharing a single material.
groups={}
for obj in list(collections["visual"].objects):
    if obj.type=="MESH" and len(obj.data.materials)==1:
        groups.setdefault(obj.data.materials[0].name,[]).append(obj)
for name,objects in groups.items():
    if len(objects)<2:continue
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join();bpy.context.object.name="trk_batch_"+name
bpy.ops.object.select_all(action="DESELECT")

scene["centerline_m"]=round(length,2)
scene["route_sections"]=", ".join(SECTIONS)
scene["source_note"]="Kenney Marble Kit + Racing Kit CC0; original RaceBall landmark greyboxes"
scene.world=bpy.data.worlds.new("Happy Valley world")
scene.world.color=(.28,.35,.42)
for area in bpy.context.screen.areas:
    if area.type=="VIEW_3D":
        area.spaces.active.region_3d.view_location=Vector(blender((100,0,110)))
        area.spaces.active.region_3d.view_distance=420
        area.spaces.active.clip_end=2000

SRC.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/"happy_valley.blend"))
for path,visible in [(ROOT/"packages/game-core/tracks/happy_valley_col.glb",["collision","markers"]),(ROOT/"apps/web/public/assets/maps/happy_valley.glb",["visual"])]:
    path.parent.mkdir(parents=True,exist_ok=True)
    for name,col in collections.items():col.hide_viewport=name not in visible;col.hide_render=name not in visible
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_active_scene=True,use_visible=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
for name,col in collections.items():col.hide_viewport=name!="visual";col.hide_render=name!="visual"
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/"happy_valley.blend"))
(SRC/"route_samples.json").write_text(json.dumps({"length":length,"starts":starts,"gates":gate_s,"points":[{"s":s,"p":xyz(s),"h":math.atan2(*tangent(s))} for s in range(math.ceil(length))]},indent=2))
result={"centerline_m":round(length,2),"sections_m":[round(b-a,1) for a,b in zip(starts,ends)],"objects":{k:len(v.objects) for k,v in collections.items()},"blend":str(SRC/"happy_valley.blend")}
