# 게임 센터 캐릭터: 08 슬림 로우폴리

2026-09-12: 사용자가 고른 **08번 슬림 체형의 성인 사람 선수**를 게임 센터와 6종 미니게임의 공통 렌더러에 적용했다. 민트 08 유니폼·네이비 반바지·크림 양말·주황 축구화, 수비수는 산호색 유니폼이다.

| 현재 파일 | 동작 / 용도 | 크기 |
| --- | --- | --- |
| poly-player-run.png | 좌우 다리를 번갈아 내딛는 8단계 달리기 | 1254 × 1254 |
| poly-player-actions.png | 준비·좌우 회피·대시·충돌·넘어짐·세리머니·킥 | 1254 × 1254 |
| poly-defender.png | 준비·좌우 스텝·웅크리기·슬라이딩·충돌·넘어짐·세리머니 | 1254 × 1254 |
| stadium.png | 관중석·골대가 있는 경기장 | 1024 × 1536 |

내장 `image_gen`으로 선택 시안을 참조해 3종 동작 원화를 만들고, 같은 도구로 배경을 투명하게 편집했다. 최종 PNG는 모두 실제 알파 채널과 모서리 알파 0을 확인한 뒤 **변환 없이 복사**했다. 생성 원본은 그대로 보관했다. 별도 배경 제거 스크립트·CLI·API는 사용하지 않았다.

렌더러는 실제 프레임 좌표와 인접 동작 사이의 클립 영역을 사용한다. 이는 원본 그림을 수정하는 처리가 아닌 스프라이트 선택 영역이다. 포즈마다 몸 크기가 달라지지 않도록 고정 축척과 발 높이를 사용한다. 독립된 동작 시계·방향 전환 시 기울기 감쇠·다리 움직임과 공의 박자·대시 잔상·피격과 착지 반응을 연결했다. 일시정지 때 애니메이션도 멈추고, `prefers-reduced-motion`에서는 부가 흔들림을 줄인다.

게임 센터 SVG 카드도 각 프레임을 명시적으로 클립해 옆 캐릭터가 여백에 비치는 문제를 막는다. 오래된 `human-*`, `mascot-*`, `player.png`, `defender.png`는 현재 앱에서 참조하지 않는다. 이전 원화의 제작 기록은 [ART-HISTORY.md](ART-HISTORY.md)에 보관했다.

선택 시안: [character-08-slim.png](../../design/character-options-2026-09-12/character-08-slim.png)

## 생성 원본

원본 폴더: `C:/Users/jojeong/.codex/generated_images/01a08eb3-401b-7972-bc23-4913aa3ba568/`

| 용도 | 동작 원화 | 최종 투명 PNG |
| --- | --- | --- |
| 선수 달리기 | exec-000c39c5-eaa1-45e9-bee5-652289340bcf.png | exec-3a1a07da-d97c-45f3-b4ad-13bb9857f8c3.png |
| 선수 액션 | exec-7734e0c3-1846-4994-8f14-c6b74debc351.png | exec-feda083b-8cba-4e71-941e-a792de70eb8b.png |
| 수비수 | exec-52c4c010-b327-44e9-ac76-42f71f1c9d27.png | exec-7da7d278-382f-4c04-afa2-ea34aef17940.png |

## 실제 제작 프롬프트

### runner

```text
Use case: stylized-concept.
Asset type: production PNG sprite atlas with REAL TRANSPARENT ALPHA, not a concept presentation.
The attached image is the approved CHARACTER IDENTITY AND RENDER STYLE reference only. Reproduce this exact lean compact adult human footballer: slim shoulders and waist, slim athletic limbs, large angular mature face, short dark polygonal hair, strong brows, small eyes, wedge nose and a confident smile. Preserve his mature compact arcade proportions, about 3.5 heads tall. Preserve the clearly visible LOW-POLY 3D triangular facets and matte rendered materials, not outlines or 2D cartoon art. Consistent camera: front three-quarter view, face visible, same orientation and studio light for all poses.
Generate exactly EIGHT isolated FULL-BODY sprites in a precisely spaced FOUR COLUMN by TWO ROW regular grid on a square canvas. Every cell equal size, camera distance and body scale IDENTICAL in all eight cells. Center the hips at the same horizontal position and use the same floor baseline within every cell. Keep at least 12% transparent margin on each side of each cell. Every limb, shoe and hair must fit entirely inside its own cell. No overlap. Keep the head size consistent throughout.
No football, floor, scenery, ground shadow, cell frames, grid lines, labels, comparison number in the corner, added lettering or watermark. The ONLY number allowed is the little 08 already on the shirt. The background must be completely empty TRANSPARENT PNG ALPHA, not ivory and not a painted gray checkerboard. Do not copy the reference background. Output a high-quality square sprite atlas, ideally 2048 x 2048.

Character outfit: the same mint-teal jersey with cream collar/cuffs, small 08 and simple shield, navy shorts, cream socks with navy stripe, orange football boots.
Action: ONE continuous forward RUN CYCLE in eight sequential, clearly distinct poses. Arms counter-swing the legs. Slight consistent forward athletic lean. Natural knee bending and visible alternating shoe placement; never duplicate neighboring poses.
Top row left to right:
1. Left-leg CONTACT: left shoe forward/down to ground, right leg stretched behind, right arm forward.
2. Left-leg DOWN/recoil: body a little lower, left knee flexed under weight, right foot lifting.
3. Left-leg PASSING: left support foot below hip, right knee swinging past it toward front, torso a little higher.
4. Left-leg TOE-OFF/flight: left heel rises behind, right knee forward high, both feet briefly free of ground.
Bottom row left to right:
5. Right-leg CONTACT, mirror the limb phase of pose 1 but keep the SAME face, haircut and camera orientation: right shoe forward/down, left leg behind, left arm forward.
6. Right-leg DOWN/recoil: right knee flexed, left foot lifts, body a little lower.
7. Right-leg PASSING: right support foot below hip, left knee passing toward front.
8. Right-leg TOE-OFF/flight: right heel behind, left knee forward high, ready to loop seamlessly back to pose 1.
This must look like eight animation keys from the SAME rig, with changing leg silhouette and balanced counter-rotating shoulders. Keep consistent body scale; ground contact is anchored, no baked shadows.

```

### player

```text
Use case: stylized-concept.
Asset type: production PNG sprite atlas with REAL TRANSPARENT ALPHA, not a concept presentation.
The attached image is the approved CHARACTER IDENTITY AND RENDER STYLE reference only. Reproduce this exact lean compact adult human footballer: slim shoulders and waist, slim athletic limbs, large angular mature face, short dark polygonal hair, strong brows, small eyes, wedge nose and a confident smile. Preserve his mature compact arcade proportions, about 3.5 heads tall. Preserve the clearly visible LOW-POLY 3D triangular facets and matte rendered materials, not outlines or 2D cartoon art. Consistent camera: front three-quarter view, face visible, same orientation and studio light for all poses.
Generate exactly EIGHT isolated FULL-BODY sprites in a precisely spaced FOUR COLUMN by TWO ROW regular grid on a square canvas. Every cell equal size, camera distance and body scale IDENTICAL in all eight cells. Center the hips at the same horizontal position and use the same floor baseline within every cell. Keep at least 12% transparent margin on each side of each cell. Every limb, shoe and hair must fit entirely inside its own cell. No overlap. Keep the head size consistent throughout.
No football, floor, scenery, ground shadow, cell frames, grid lines, labels, comparison number in the corner, added lettering or watermark. The ONLY number allowed is the little 08 already on the shirt. The background must be completely empty TRANSPARENT PNG ALPHA, not ivory and not a painted gray checkerboard. Do not copy the reference background. Output a high-quality square sprite atlas, ideally 2048 x 2048.

Character outfit: same mint-teal jersey with cream collar/cuffs, small 08 and simple shield, navy shorts, cream socks with navy stripe, orange football boots.
Eight distinct action poses:
Top row left to right:
1. Relaxed ready idle: feet apart, knees softly bent, arms relaxed, confident smile.
2. Cut/dodge to the VIEWER'S LEFT: torso leaning left, right outside foot pushing against ground, left leg reaching left, arms balancing.
3. Cut/dodge to the VIEWER'S RIGHT: opposite of pose 2, keeping same face/hair orientation and identity.
4. Sprint burst/dash: body pitched forward, one knee driving high, opposite arm punching forward, determined expression.
Bottom row left to right:
5. Hit/recoil: shoulders recoiling slightly back, arms out, one leg stumbling forward, startled eyebrows, still standing.
6. Fall: sitting on the ground after a stumble, knees bent, one hand bracing, disappointed but expressive face. Preserve the SAME character model size, do not inflate the seated pose to standing height.
7. Celebration: modest athletic hop, both fists raised, mouth in a broad happy smile. Maintain the same body/head scale and fit all hands inside the cell.
8. Football kick follow-through: left foot planted, right leg extended diagonally forward, hips slightly turned, opposite arm extended for balance. No ball in the sheet.
Clearly human and visibly the exact approved slim low-poly adult, never toddler proportions.

```

### defender

```text
Use case: stylized-concept.
Asset type: production PNG sprite atlas with REAL TRANSPARENT ALPHA, not a concept presentation.
The attached image is the approved CHARACTER IDENTITY AND RENDER STYLE reference only. Reproduce this exact lean compact adult human footballer: slim shoulders and waist, slim athletic limbs, large angular mature face, short dark polygonal hair, strong brows, small eyes, wedge nose and a confident smile. Preserve his mature compact arcade proportions, about 3.5 heads tall. Preserve the clearly visible LOW-POLY 3D triangular facets and matte rendered materials, not outlines or 2D cartoon art. Consistent camera: front three-quarter view, face visible, same orientation and studio light for all poses.
Generate exactly EIGHT isolated FULL-BODY sprites in a precisely spaced FOUR COLUMN by TWO ROW regular grid on a square canvas. Every cell equal size, camera distance and body scale IDENTICAL in all eight cells. Center the hips at the same horizontal position and use the same floor baseline within every cell. Keep at least 12% transparent margin on each side of each cell. Every limb, shoe and hair must fit entirely inside its own cell. No overlap. Keep the head size consistent throughout.
No football, floor, scenery, ground shadow, cell frames, grid lines, labels, comparison number in the corner, added lettering or watermark. The ONLY number allowed is the little 08 already on the shirt. The background must be completely empty TRANSPARENT PNG ALPHA, not ivory and not a painted gray checkerboard. Do not copy the reference background. Output a high-quality square sprite atlas, ideally 2048 x 2048.

Adapt this approved character into a matching OPPONENT: same lean athletic compact adult proportions and low-poly faceted rendering, slightly different neat chestnut hairstyle, coral-red jersey with cream collar/cuffs and simple shield (no 08 number), dark navy shorts, cream socks with coral stripe, navy and cream football boots. Friendly competitive strong brows, no angry villain or childish redesign.
Eight distinct defensive poses:
Top row left to right:
1. Ready stance, knees bent, both arms slightly out, weight balanced.
2. Step LEFT, left leg extended and right leg driving, torso shifting left.
3. Step RIGHT, opposite leg phase and body shift of pose 2.
4. Lower compressed ready stance, heels grounded and shoulders slightly down, preparing to spring.
Bottom row left to right:
5. Sliding tackle toward viewer's left, one leg extended sideways, trailing leg bent, hand bracing, all limbs inside cell.
6. Recoil after being passed, shoulders twist, arms out, weight on back leg.
7. Sitting after missed tackle, both knees bent, one hand grounded, surprised but good-natured face.
8. Save celebration: hop with both arms raised confidently and knees bent, same body/head size.
Do not stretch the shorter poses to match standing height: same model scale for all cells, all poses within their own cells, transparent background.

```

### 투명 배경 편집

각 동작 원화를 참조 이미지로 전달했다. 체크무늬가 픽셀로 남은 중간 출력은 앱에 사용하지 않았다.

```text
Use case: background-extraction.
Background: transparent.
Create a transparent-background PNG cutout of the eight football players. Remove the entire background and make it fully transparent (alpha channel). Keep the player colors, poses, shapes and positions unchanged. No backdrop, no pattern, no grid, no shadow. Only the eight isolated football players remain visible.
```

