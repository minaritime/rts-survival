"""
스프라이트 낱장을 찍는다.
  blender -b -P render_sprites.py -- <출력 폴더> [이름,이름,...]
이름을 주면 그것만 찍는다. 출력 폴더 아래에 <이름>.png 또는 <이름>/d<방향>_f<장>.png

방향 번호 k (0~7): 화면 기준 시계 방향. 0 동, 1 남동, 2 남, 3 남서, 4 서, 5 북서, 6 북, 7 북동
게임은 atan2(화면 dy, dx) / 45도 를 반올림해서 같은 번호를 쓴다.
"""
import math
import os
import shutil
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
import models  # noqa: E402

DIRECTIONS = 8
WALK_FRAMES = 4


def new_stage(frame_tiles=2.0, samples=48, stretch=False, frame_height=None):
    """
    빈 장면 + 조명 + 그림자 받는 바닥 + 카메라. 모델을 붙일 facing 빈 객체를 돌려준다.
    유닛·작은 물체는 늘리지 않는다 (common.stretch_root 설명). 건물은 stretch=True 로.
    """
    models._MATS.clear()
    common.reset_scene(samples=samples)
    common.add_lights()
    root = common.stretch_root(stretch=stretch)
    common.shadow_catcher(root, size=8.0)
    facing = models.empty('facing', parent=root)
    common.add_camera(0, 0, frame_tiles, frame_height or frame_tiles, stretch=stretch)
    return facing


def model_yaw(k):
    """
    방향 k 를 화면에서 정확히 45도 간격으로 보이게 하는 모델 회전 (Blender Z, 화면 시계 방향 = 음수).
    유닛은 늘리지 않고 찍으므로 화면에서 남북이 sin45 배로 눌린다. 그대로 45도 돌리면 대각선이 약 35도로 보여서
    남북 성분을 STRETCH_Y 배 해서 각도를 되돌린다.
    """
    a = math.radians(45 * k)
    return -math.atan2(math.sin(a) * common.STRETCH_Y, math.cos(a))


def static(out_dir, name, build, frame_tiles=2.0, scale=1.0, stretch=False, frame_height=None):
    """
    scale: 게임 화면에서 알아보기 좋게 모델을 키우는 배율 (칸보다 살짝 커도 됨)
    stretch: 건물처럼 칸에 딱 맞아야 하는 것은 True (common.stretch_root)
    frame_height: 키가 큰 건물은 그림 세로를 더 길게 (그림 한가운데 = 건물 자리 한가운데는 그대로)
    """
    facing = new_stage(frame_tiles, stretch=stretch, frame_height=frame_height)
    facing.scale = (scale, scale, scale)
    build(facing)
    common.render_to(os.path.join(out_dir, f'{name}.png'))


def directional(out_dir, name, build, pose=None, frames=1, frame_tiles=2.0, scale=1.0):
    """8방향 x frames 장. pose(rig, phase) 가 있으면 0번 장은 서 있기, 1~ 은 걷기 주기"""
    facing = new_stage(frame_tiles)
    facing.scale = (scale, scale, scale)
    rig = build(facing)
    # ART_DIRS="2,0": 미리보기 때 일부 방향만 (게임용은 비워 둠 = 8방향 전부)
    only_dirs = os.environ.get('ART_DIRS')
    dirs = [int(d) for d in only_dirs.split(',')] if only_dirs else range(DIRECTIONS)
    for k in dirs:
        facing.rotation_euler = (0, 0, model_yaw(k))
        for f in range(frames):
            if pose is not None:
                pose(rig, 0.0 if f == 0 else (f - 1) / (frames - 1))
            common.render_to(os.path.join(out_dir, name, f'd{k}_f{f}.png'))


SMALL = 1.6  # 덤불·잔해: 원래 모델이 작아서 많이 키움
NORMAL = 1.3

JOBS = {
    'mineral_0': lambda out: static(out, 'mineral_0', lambda r: models.mineral(r, seed=1), scale=NORMAL),
    'mineral_1': lambda out: static(out, 'mineral_1', lambda r: models.mineral(r, seed=7), scale=NORMAL),
    'mineral_2': lambda out: static(out, 'mineral_2', lambda r: models.mineral(r, seed=13), scale=NORMAL),
    'berry_full': lambda out: static(out, 'berry_full', lambda r: models.berry_bush(r, fill=1.0), scale=SMALL),
    'berry_half': lambda out: static(out, 'berry_half', lambda r: models.berry_bush(r, fill=0.5), scale=SMALL),
    'berry_empty': lambda out: static(out, 'berry_empty', lambda r: models.berry_bush(r, fill=0.0), scale=SMALL),
    'debris_0': lambda out: static(out, 'debris_0', lambda r: models.debris(r, seed=3), scale=SMALL),
    'debris_1': lambda out: static(out, 'debris_1', lambda r: models.debris(r, seed=11), scale=SMALL),
    'feeder_on': lambda out: static(out, 'feeder_on', lambda r: models.feeder(r, on=True), scale=NORMAL),
    'feeder_off': lambda out: static(out, 'feeder_off', lambda r: models.feeder(r, on=False), scale=NORMAL),
    # 건물: 3x3 칸, 그림 4x6 칸 (192x288). 그림 한가운데 = 건물 자리 한가운데
    'command_center': lambda out: static(out, 'command_center', models.command_center, frame_tiles=4.0,
                                         frame_height=6.0, stretch=True),
    'command_center_frame': lambda out: static(out, 'command_center_frame', models.command_center_frame,
                                               frame_tiles=4.0, frame_height=6.0, stretch=True),
    # 3단계 건물. 그림 크기: 1칸 = 2x3칸(96x144), 2x2 = 3x4칸(144x192), 3x3 = 4x6칸(192x288)
    'campfire': lambda out: static(out, 'campfire', models.campfire, frame_tiles=2.0, frame_height=3.0, stretch=True),
    'barricade': lambda out: static(out, 'barricade', models.barricade, frame_tiles=2.0, frame_height=3.0, stretch=True),
    'scrap_turret': lambda out: static(out, 'scrap_turret', models.scrap_turret, frame_tiles=2.0, frame_height=3.0,
                                       stretch=True),
    'supply_depot': lambda out: static(out, 'supply_depot', models.supply_depot, frame_tiles=3.0, frame_height=4.0,
                                       stretch=True),
    'barracks': lambda out: static(out, 'barracks', models.barracks, frame_tiles=4.0, frame_height=6.0, stretch=True),
    'turret': lambda out: static(out, 'turret', models.turret, frame_tiles=3.0, frame_height=4.0, stretch=True),
    'infantry_lab': lambda out: static(out, 'infantry_lab', models.infantry_lab, frame_tiles=3.0, frame_height=4.0,
                                       stretch=True),
    'frame_1': lambda out: static(out, 'frame_1', lambda r: models.construction_frame(r, 1.0), frame_tiles=2.0,
                                  frame_height=3.0, stretch=True),
    'frame_2': lambda out: static(out, 'frame_2', lambda r: models.construction_frame(r, 2.0), frame_tiles=3.0,
                                  frame_height=4.0, stretch=True),
    'frame_3': lambda out: static(out, 'frame_3', lambda r: models.construction_frame(r, 3.0), frame_tiles=4.0,
                                  frame_height=6.0, stretch=True),
    'grazer': lambda out: directional(out, 'grazer', models.grazer, scale=NORMAL),
    # 5단계 괴물 (다리 여럿 걷기 4장) + 고기
    'swarm': lambda out: directional(out, 'swarm', models.swarm, pose=models.pose_crawl,
                                     frames=1 + WALK_FRAMES, scale=NORMAL),
    'charger': lambda out: directional(out, 'charger', models.charger, pose=models.pose_crawl,
                                       frames=1 + WALK_FRAMES, scale=1.15),
    'meat': lambda out: static(out, 'meat', models.meat, scale=SMALL),
    'commander': lambda out: directional(out, 'commander', models.commander, pose=models.pose_walk,
                                         frames=1 + WALK_FRAMES, scale=NORMAL),
    'worker': lambda out: directional(out, 'worker', models.worker, pose=models.pose_walk,
                                      frames=1 + WALK_FRAMES, scale=NORMAL),
    'rifleman': lambda out: directional(out, 'rifleman', models.rifleman, pose=models.pose_walk,
                                        frames=1 + WALK_FRAMES, scale=NORMAL),
    'assault': lambda out: directional(out, 'assault', models.assault, pose=models.pose_walk,
                                       frames=1 + WALK_FRAMES, scale=NORMAL),
}


def main():
    args = common.script_args()
    out_dir = os.path.abspath(args[0])
    if len(args) > 1:
        only = args[1].split(',')
    else:
        # 전부 찍을 때는 옛 낱장(미리보기·이름 바뀐 것)이 시트에 섞이지 않게 비우고 시작
        shutil.rmtree(out_dir, ignore_errors=True)
        only = list(JOBS)
    for name in only:
        JOBS[name](out_dir)


main()
