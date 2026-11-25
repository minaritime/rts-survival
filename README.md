# RTS 서바이벌 (가칭)

지휘관 혼자 맨손으로 시작해 기지를 세우고, 몰려오는 괴물을 버티는 RTS + 서바이벌 웹 게임입니다.
지금은 1맵 시제품입니다.

**플레이:** https://minaritime.github.io/rts-survival/

## 조작
- 왼쪽 클릭: 고르기, 왼쪽으로 끌기: 여러 유닛 고르기
- 오른쪽 클릭: 이동, 채집, 공격, 짓기 이어 하기, 수리
- 아래 명령 칸 또는 단축키(QWERT / ASDFG / ZXCVB): 건물 짓기, 유닛 뽑기, 공격(A), 정지(S)
- Ctrl+숫자: 부대 지정, 숫자: 부대 불러오기, F1: 지휘관
- ESC: 일시정지 (게임 중에는 마우스가 화면 밖으로 나가지 않습니다)

## 개발
```
npm install
npm run dev     # http://localhost:5180
npm run check   # 타입 검사 + 테스트
npm run build
```
그림은 Blender 로 만듭니다 (`art/`). 자세한 구조는 `CLAUDE.md`, 기획은 `기획.md`·`시제품.md` 에 있습니다.
