"""
Blender 공통 설정: 장면 초기화, 45도 정사영 카메라, 어두운 SF 조명, 재질 도우미, 렌더.

좌표 약속 (게임과 맞추기)
- Blender 1 단위 = 게임 1칸 = TILE_PX 픽셀
- Blender +X = 화면 오른쪽(동), +Y = 화면 위(북), +Z = 높이
- 카메라는 남쪽에서 북쪽을 45도로 내려다본다
- 바닥이 정사각형 칸으로 보이도록 장면 전체를 남북(Y)으로 STRETCH_Y 배 늘려서 찍는다.
  그러면 바닥 1칸 = 화면 1칸, 높이 h 는 화면에서 h * cos(45도) 만큼 위로 솟는다 (스타식 눈속임)
"""
import math
import os

import bpy

TILE_PX = 48
TILT_DEG = 45.0
STRETCH_Y = 1.0 / math.sin(math.radians(TILT_DEG))
HEIGHT_TO_SCREEN = math.cos(math.radians(TILT_DEG))


def reset_scene(samples=48):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    # AgX 는 밝게 빛나는 색을 하얗게 탈색시킨다. 게임 그림은 색이 또렷해야 해서 표준으로
    scene.view_settings.view_transform = 'Standard'
    _world(scene)
    return scene


def _world(scene):
    world = bpy.data.worlds.new('world')
    scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    bg = world.node_tree.nodes.get('Background')
    if bg is None:
        bg = world.node_tree.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.015, 0.02, 0.035, 1.0)
    bg.inputs['Strength'].default_value = 1.0


def add_lights():
    """
    어두운 SF: 북서쪽 위에서 차가운 주광(그림자는 남동쪽 = 화면 오른쪽 아래로) + 남동쪽에서 약한 주황 반사광.
    해(SUN)는 자기 -Z 방향으로 빛을 쏜다. 회전 (θ, 0, φ) 이면 빛이 가는 방향은 (-sinθ·sinφ, sinθ·cosφ, -cosθ).
    """
    key = bpy.data.lights.new('key', type='SUN')
    key.energy = 2.6
    key.angle = math.radians(8)
    key.color = (0.78, 0.86, 1.0)
    key_obj = bpy.data.objects.new('key', key)
    key_obj.rotation_euler = (math.radians(36), 0, math.radians(-135))
    bpy.context.scene.collection.objects.link(key_obj)

    rim = bpy.data.lights.new('rim', type='SUN')
    rim.energy = 0.8
    rim.angle = math.radians(20)
    rim.color = (1.0, 0.62, 0.35)
    rim_obj = bpy.data.objects.new('rim', rim)
    rim_obj.rotation_euler = (math.radians(60), 0, math.radians(45))
    bpy.context.scene.collection.objects.link(rim_obj)


def add_camera(center_x, center_y, width_tiles, height_tiles, stretch=True):
    """
    바닥점 (center_x, center_y) (늘리기 전 좌표)를 그림 한가운데에 두는 정사영 카메라.
    그림 크기 = width_tiles x height_tiles 칸. stretch 는 stretch_root 와 같게 준다.
    """
    scene = bpy.context.scene
    # ART_SCALE: 사람이 품질을 살펴볼 때만 크게 찍는 배율 (게임용은 1)
    px = TILE_PX * int(os.environ.get('ART_SCALE', '1'))
    scene.render.resolution_x = int(round(width_tiles * px))
    scene.render.resolution_y = int(round(height_tiles * px))

    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = max(width_tiles, height_tiles)
    cam.clip_start = 0.1
    cam.clip_end = 1000
    cam_obj = bpy.data.objects.new('cam', cam)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    tilt = math.radians(TILT_DEG)
    dist = 200.0
    # 늘린 장면에서 바닥점 (cx, cy*STRETCH_Y, 0) 을 바라본다
    target = (center_x, center_y * (STRETCH_Y if stretch else 1.0), 0.0)
    cam_obj.location = (target[0], target[1] - dist * math.cos(tilt), dist * math.sin(tilt))
    cam_obj.rotation_euler = (math.radians(90) - tilt, 0, 0)
    return cam_obj


def stretch_root(name='root', stretch=True):
    """
    모델을 붙일 빈 객체.
    stretch=True: 남북으로 늘려서 바닥 칸이 화면에서 정사각형이 되게 한다 (지형·건물처럼 칸에 맞아야 하는 것).
    stretch=False: 실제 45도 그대로 (유닛·작은 물체. 늘리면 사람이 위아래로 길쭉해진다).
    """
    root = bpy.data.objects.new(name, None)
    root.scale = (1.0, STRETCH_Y if stretch else 1.0, 1.0)
    bpy.context.scene.collection.objects.link(root)
    return root


def shadow_catcher(root, size=6.0):
    """투명 배경에 그림자만 남기는 바닥"""
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    plane = bpy.context.active_object
    plane.is_shadow_catcher = True
    plane.parent = root
    return plane


def material(name, color, metallic=0.0, roughness=0.6, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def bevel(obj, width=0.03, segments=2):
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    return obj


def flat_shading(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def render_to(path):
    # Blender 는 상대 경로를 작업 폴더 기준으로 읽지 않는다 (저장이 조용히 안 됨). 항상 전체 경로로
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene = bpy.context.scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def script_args():
    """blender ... -- a b c 의 a b c"""
    import sys
    argv = sys.argv
    return argv[argv.index('--') + 1:] if '--' in argv else []
