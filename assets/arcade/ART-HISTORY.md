# 게임 센터 그래픽

2026-09-12: 짧은 팔다리·큰 머리·점눈·단순한 표정의 **사람 축구 선수**로 변경했다. 민트색 유니폼의 선수와 산호색 유니폼의 수비수이며, 동물 귀·꼬리나 복잡한 애니메이션식 눈 표현은 사용하지 않는다. 내장 `image_gen`으로 원화를 생성하고 선수 달리기 동작을 같은 도구로 수정했다. CLI/API 방식은 사용하지 않았다.

| 현재 파일 | 용도 | 크기 |
| --- | --- | --- |
| human-player.png | 사람 선수: 기본·교차 달리기·점프·좌우 회피·충돌·세리머니 8동작 | 1254 × 1254 |
| human-defender.png | 사람 수비수: 수비·이동·슬라이딩·넘어짐 4동작 | 1254 × 1254 |
| stadium.png | 관중석과 골대가 있는 세로 경기장 | 1024 × 1536 |

현재 선수·수비수 PNG는 실제 알파 채널과 모서리 알파 값 0을 확인했다. 최종 생성 파일을 변환 없이 복사하고 `football-arcade.js`의 프레임 좌표를 원화의 실제 경계에 맞췄다. 게임 센터·입장·결과·새 드리블 런과 기존 게임의 공통 캐릭터 렌더러가 같은 사람 캐릭터를 사용한다.

원본 선수: `exec-2002743d-d7a4-4ab7-9096-3132c750130f.png`. 최종 달리기 수정: `exec-22deac14-ea0e-49fa-b626-cac6e2610d56.png`. 수비수: `exec-0286122c-677e-4b30-b14b-a83730742694.png`. 생성 원본은 그대로 남겨 두었다. 수정 과정에서 체크무늬 배경이 불투명하게 포함된 중간 결과는 사용하지 않았다.

`mascot-player.png`, `mascot-defender.png`, `player.png`, `defender.png`는 이전 제작 기록으로만 남아 있으며 현재 게임은 참조하지 않는다. 사이트 게시에는 위 표의 현재 PNG 세 개를 사용한다.

## 현재 사람 캐릭터 제작 프롬프트

### 선수 원화

```text
Use case: stylized-concept. Asset type: production transparent PNG sprite atlas for an existing soccer minigame. Primary request: an adorable HUMAN football player with a simple rounded face and tiny body. Style: ORIGINAL cheerful casual mobile minigame HUMAN cartoon art. Very simple, cute 1.8-head-tall people: a large round peach face, tiny C-shaped human ears, black DOT eyes with NO irises and NO gleaming highlights, a tiny curved mouth, small blush circles, short smooth hair drawn as one simple solid shape, a tiny squishy torso, short rounded human arms and stubby legs, simple mitten-shaped human hands. Head about 60 percent of total height. Warm dark-brown bold smooth outlines, flat opaque pastel colors with only one small cel shadow. As legible and friendly as little illustrated board-game people. Human football players in exaggerated cartoon proportions, not anime heroes and not animals. NO animal ears, tails, snouts, paws, fur, costumes, anime/manga eyes, shiny eyes, detailed hair strands, spiky hair, muscular bodies, long limbs, realistic anatomy, 3D plastic shading, gradients, or realistic rendering. Subject: the SAME original human male soccer player in all eight poses, neat short dark-brown hair with a softly rounded fringe, plain mint-teal jersey with a cream collar, dark teal shorts, short cream socks, tiny orange football shoes. Happy cheeky friendly personality. Composition: EXACTLY 8 isolated full-body sprites arranged in exactly 4 columns and 2 rows on a square canvas. Equal cell size, all centered with the same scale and baseline. Keep generous clear space around each figure, no touching or overlap. Slight front three-quarter camera, face visible in every pose. Top row left to right: (1) smiling idle, arms relaxed; (2) running in place with left leg forward and opposite arm forward; (3) running in place with right leg forward and opposite arm forward, clearly distinct from previous pose; (4) happy little hop with knees tucked and hands raised. Bottom row left to right: (5) body tilting left for a quick dodge; (6) body tilting right for a quick dodge; (7) sitting after a stumble, small spirals for eyes, surprised mouth; (8) both hands raised, big curved closed-eye smile, celebrating. All eight must be visibly human, with identical hair, face, outfit and proportions. Scene: genuinely TRANSPARENT PNG alpha around all figures, no painted checkerboard or solid background, no ground shadows, no scenery, no soccer balls, no text, no labels, no grid, no numbers, no logos or watermark.
```

### 선수 달리기 수정

입력: 위 선수 원화의 투명 PNG.

```text
Edit this transparent PNG sprite sheet. Keep the cute HUMAN soccer player, the same 4-column / 2-row grid, and all eight full-body poses in place. Change ONLY the third sprite in the top row: make it a clearly opposite running step to the second sprite, with the other shoe kicked forward and the other hand swinging forward. Keep the hairstyle, face, jersey, body scale, palette and all seven other sprites unchanged. OUTPUT ON A TRANSPARENT BACKGROUND, with no background pixels, no checkerboard, no ground shadows, no scene, and no text. Return the entire square transparent PNG atlas.
```

### 수비수 원화

```text
Use case: stylized-concept. Asset type: production transparent PNG sprite atlas for an existing soccer minigame. Primary request: an adorable HUMAN football defender with a simple rounded face and tiny body. Style: ORIGINAL cheerful casual mobile minigame HUMAN cartoon art. Very simple, cute 1.8-head-tall people: a large round peach face, tiny C-shaped human ears, black DOT eyes with NO irises and NO gleaming highlights, a tiny curved mouth, small blush circles, short smooth hair drawn as one simple solid shape, a tiny squishy torso, short rounded human arms and stubby legs, simple mitten-shaped human hands. Head about 60 percent of total height. Warm dark-brown bold smooth outlines, flat opaque pastel colors with only one small cel shadow. As legible and friendly as little illustrated board-game people. Human football players in exaggerated cartoon proportions, not anime heroes and not animals. NO animal ears, tails, snouts, paws, fur, costumes, anime/manga eyes, shiny eyes, detailed hair strands, spiky hair, muscular bodies, long limbs, realistic anatomy, 3D plastic shading, gradients, or realistic rendering. Subject: the SAME original human male soccer defender in all four poses, neat short chestnut hair with a soft small side-part, plain coral-red jersey with cream collar, dark navy shorts, short cream socks, tiny navy and cream football shoes. Friendly competitive expression, small short eyebrows above dot eyes. Composition: EXACTLY 4 isolated full-body sprites arranged in exactly 2 columns and 2 rows on a square canvas. Equal cell size, all centered with the same scale and baseline. Keep generous clear space around each figure, no touching or overlap, all limbs inside the cell. Slight front three-quarter camera, face visible. Top-left: low defensive ready stance, feet apart and both open little hands out. Top-right: side-step to block, one foot extended sideways, determined puckered mouth and round cheeks. Bottom-left: sliding tackle sideways, one leg extended, one hand bracing, friendly surprised look. Bottom-right: sitting on bottom after being passed, both hands up, small dot eyes and O mouth. All four must be visibly human, with identical hair, face, outfit and proportions. Scene: genuinely TRANSPARENT PNG alpha around all figures, no painted checkerboard or solid background, no ground shadows, no scenery, no soccer balls, no text, no labels, no grid, no numbers, no logos or watermark.
```

## 이전 동물 마스코트 제작 기록

아래는 2026-09-11에 제작한 이전 버전의 기록이다. 현재 적용 버전은 위의 사람 캐릭터다.

2026-09-11: 내장 `image_gen` 도구로 둥근 강아지 선수와 고양이 수비수를 제작했다. 아래 PNG와 설명은 당시의 적용 기록이다. CLI/API 방식은 사용하지 않았다.

| 파일 | 용도 | 크기 |
| --- | --- | --- |
| mascot-player.png | 강아지 선수: 기본·달리기·점프·좌우 회피·충돌·세리머니 8동작 | 1254 × 1254 |
| mascot-defender.png | 고양이 수비수: 수비·이동·슬라이딩·넘어짐 4동작 | 1254 × 1254 |
| stadium.png | 관중석과 골대가 있는 세로 경기장 | 1024 × 1536 |

새 캐릭터 PNG는 32비트 RGBA이며 모서리 알파 값 0을 확인했다. 생성 원본을 바이트 변환 없이 이 폴더에 복사했다. 파일 전체를 실제 프레임 경계에 따라 잘라 그리므로 셀 경계에 걸친 고양이 발도 빠지지 않는다. `football-arcade.js`의 프레임 좌표를 새 원화에 맞췄고, SVG 카드의 viewport도 프레임 영역으로 제한했다.

게임 센터 카드·이름 입력·결과, 새 드리블 런, 기존 게임의 공통 `ChibiSprite` 렌더러에 사용한다. 게임 센터를 열 때 필요한 캐릭터 이미지를 표시하고 경기 진입 시 나머지 이미지를 불러온다. 사이트를 열기만 했을 때는 새 원화 다운로드를 시작하지 않는다.

생성 원본 파일: `exec-57871494-3627-4655-bff0-e78cb44dee17.png`(강아지), `exec-de2802e1-3d85-4413-9bc5-3938c0b34aea.png`(고양이). 처음 제작했던 `player.png`, `defender.png`는 작업 기록으로 남겨 두었으며 현재 게임에서는 참조하지 않는다.

## 이전 동물 캐릭터 제작 프롬프트

### 강아지 선수

```text
Use case: stylized-concept. Asset type: production transparent sprite sheet for a tiny mobile soccer arcade game. Create an ORIGINAL very cute plump cream puppy mascot, NOT a human: rounded mochi-like head and body, two short floppy caramel ears, tiny black dot eyes, small oval brown nose, blush dots, little mitten paws and stubby feet. Head and torso together only 1.5 heads tall. Wearing a plain mint-teal soccer shirt, dark teal little shorts and tiny orange sneakers. Style: polished cheerful Korean casual phone minigame mascot illustration, flat opaque pastel cel colors, one small clean shadow tone, bold smooth dark-brown outlines, simple readable round silhouette. No anime eyes, human hair, detailed anatomy, realistic materials, gradients or glossy 3D. EXACTLY eight full-body poses of THE SAME puppy in a regular 4-column by 2-row sprite grid on a square canvas. Each pose centered in its own equal cell, same scale and same baseline; no overlaps, generous transparent padding. Row 1: idle happy front three-quarter view; jogging left foot forward; jogging right foot forward; happy little hop with ears raised. Row 2: leaning left quick side step; leaning right quick side step; startled sitting tumble with tiny dizzy eyes; two paws raised celebrating. Faces toward viewer in all poses. Each sprite occupies at most 78% of cell width and 84% of cell height. Clean authentic PNG alpha transparency everywhere around the characters, NOT a painted checkerboard, no solid background. No labels, text, numbers, grid lines, soccer balls, ground, shadows outside the sprites, logos or watermark.
```

### 고양이 수비수

```text
Use case: stylized-concept. Asset type: production transparent sprite sheet for a tiny mobile soccer arcade game. Create an ORIGINAL adorable round orange kitten defender mascot, NOT a human: plump mochi head and body, little triangular ears, cream muzzle, two tiny black dot eyes and tiny curved eyebrows, short paws, stubby feet, tiny striped tail. Head and torso together only 1.5 heads tall. Wearing a plain coral-red soccer jersey, dark red shorts, small navy sneakers. Friendly determined competitive expression. Style: polished cheerful Korean casual phone minigame mascot illustration, flat opaque pastel cel colors, one small clean shadow tone, bold smooth dark-brown outlines, simple readable round silhouette. No anime eyes, hair, detailed anatomy, realistic materials, gradients or glossy 3D. EXACTLY four full-body poses of THE SAME kitten in a regular 2-column by 2-row sprite grid on a square canvas. Each pose centered in its own equal cell, same scale and same baseline; no overlaps, generous transparent padding. Top left: standing wide with both paws out to defend. Top right: side-stepping ready to block, cheeks puffed. Bottom left: sliding tackle sideways with one stubby leg stretched, fun dynamic pose. Bottom right: sitting on bottom looking surprised after being passed, paws up, tiny dazed face. Faces toward viewer in all poses. Each sprite occupies at most 78% of cell width and 84% of cell height. Clean authentic PNG alpha transparency everywhere around the characters, NOT a painted checkerboard, no solid background. No labels, text, numbers, grid lines, soccer balls, ground, shadows outside the sprites, logos or watermark.
```

## 초기 원화 제작 기록

아래는 처음 제작한 사람형 캐릭터와 현재도 사용하는 경기장의 제작 기록이다.

내장 `image_gen` 도구로 제작한 독자적인 2D 축구 캐릭터와 경기장이다. 생성 결과를 확인한 후 실제 게임에서 사용하는 PNG 파일을 이 폴더에 복사했다. 아래 프롬프트로 캐릭터의 그림체와 동작을 제작했으며, 수비수의 첫 결과에 포함된 체크무늬 배경은 같은 도구로 제거했다.

| 파일 | 용도 | 크기 |
| --- | --- | --- |
| player.png | 달리기·좌우 회피·충돌·세리머니, 4열 × 2행 | 1254 × 1254 |
| defender.png | 수비·가로막기·태클·넘어짐, 2열 × 2행 | 1254 × 1254 |
| stadium.png | 관중석과 골대가 있는 세로 경기장 | 1024 × 1536 |

캐릭터 PNG 두 개는 실제 알파 채널을 포함한다. 원본 이미지는 그대로 두고, 게임은 `football-arcade.js`에 정의된 프레임 좌표로 필요한 동작을 그린다. UI 글자와 점수는 이미지에 넣지 않고 HTML로 표시한다. 최초 게임 진입 시 이미지 세 개를 불러오므로 사이트를 열기만 했을 때는 이미지 다운로드를 시작하지 않는다.

## 제작 프롬프트

### 선수

Use case: stylized-concept.
Asset type: production-ready transparent PNG animated character sprite atlas for a polished Korean casual football mobile game.
Create ONE 1024 x 1024 sprite sheet, a precise 4-column by 2-row grid of eight equal 256 x 512? NO: eight equal 256 x 512 would be wrong; use a 4-column by 2-row grid with cells 256 pixels wide and 512 pixels tall, across a 1024 x 1024 sheet. Each character centered in its cell with identical ground baseline and scale, occupying about 200px wide and 320px tall. No visible grid, text, labels, frames, ground or background. Real transparent alpha.
Subject: the SAME original adorable compact chibi footballer in all eight frames, large round head, small athletic body, tousled dark chestnut hair with a recognizable tuft, expressive dark eyes and confident tiny smile, warm skin, forest teal jersey with cream collar and no markings, cream shorts, teal socks and bright amber football boots. Full body including feet and hands; nothing cropped. Original character, not an existing franchise mascot.
Art direction: exceptional commercial 2D casual game character art, clean softly inked deep brown outlines, appealing rounded silhouette, precise cel shading, subtle soft highlights, restrained warm color harmony, highly readable at 80 pixels tall. Like a beautiful hand-painted animation production sprite, NOT crude geometric shapes, NOT emoji, NOT pixel art, NOT photorealistic, NOT a 3D render.
Camera: consistent slightly elevated three-quarter FRONT view. Row 1 left to right: four clearly different sequential frames of an in-place running loop, alternating left/right leg extension and opposite arm swing, face visible, subtly leaning forward. Row 2 left to right: leaning left to dodge, leaning right to dodge, stumbling with surprised face, triumphant arms-up celebration. Maintain exactly the same identity, outfit, proportions and camera in all eight cells. No ball or other objects. Preserve transparent negative space between all figures.

### 경기장

Use case: stylized-concept. Asset type: actual portrait 2:3 game background plate for a polished hand-painted 2D football arcade game, 1024 x 1536. The reference is ART STYLE ONLY. Do not include its characters. A beautiful intimate neighborhood football stadium in warm sunny afternoon light, slightly elevated nearly orthographic view. The playable green grass strip occupies the central 76 percent of the picture from top to bottom with strictly PARALLEL vertical sidelines, not a vanishing point. Keep this long central grass field clear, calm, legible and open for animated footballers, with alternating subtle turf stripes. Along the very thin left and right borders: carefully painted small spectator stands with cute tiny crowd shapes, teal and butter-yellow pennants, coral banners without writing, little flower/grass tufts, soft shadows, a few rounded trees beyond the stands. The uppermost 12 percent can contain a small distant goal, field-end decorations, festive stadium lights and sky. The lower 80 percent must be an unobstructed playing field with no permanent characters, balls, objects, panels, markings cutting across the whole middle, score, UI, lettering or watermark. Delightful premium Korean/Japanese 2D casual mobile game environment art: precise warm dark outlines, soft cel-painted texture, cream highlights, harmonized rich greens, very charming crafted details around the edges. Match the reference's crisp rounded 2D illustration quality, not 3D render or pixel art. The field is the usable game scene, not a poster or screenshot.

### 수비수

Use case: stylized-concept. Asset type: transparent PNG opponent animation atlas, 1024 x 1024 square, EXACTLY 2 columns and 2 rows of equal 512 x 512 cells. The reference image is a STYLE AND PROPORTION reference only. Draw a DIFFERENT original chibi football defender with short wavy copper hair, determined bushy eyebrows and a playful mischievous expression, coral red jersey with cream trim, dark navy shorts, red socks and white cleats. No lettering, no number, no logo, no ball. Commercial quality clean 2D hand-painted animation sprite, warm deep brown outlines, cel shading, rounded polished forms and large expressive head, matching the reference's quality and camera. Slightly elevated FRONT three-quarter view. Same character and camera, same consistent scale and feet baseline within all four cells, each full body centered with clear transparent space around it. Top-left: ready defensive stance, knees bent, arms out. Top-right: stepping to one side to block, determined. Bottom-left: sliding tackle pose, one leg extended sideways and hands bracing, all limbs fully in the cell. Bottom-right: surprised missed tackle, looking off balance. Real transparent alpha outside the four isolated characters. No backgrounds, shadows under feet, grid lines, panels or labels. Nothing may touch or cross cell boundaries.

### 수비수 배경 수정

Use case: background-extraction. Edit the provided defender sprite atlas ONLY by removing the entire gray-and-white checkerboard background and making all that background truly transparent with an alpha channel. This checker pattern was mistakenly baked into the pixels. Preserve the four original footballer drawings, colors, expression, poses, precise locations and scale, and the 2x2 sprite sheet layout. Do not redraw the characters. Preserve opaque white highlights, white socks/trim/boots belonging to the character. Remove checkerboard pixels between the arms/legs as well as around the figures. Output a transparent PNG, no replacement background or shadow, no grid, no text. The background must be transparent, not painted with a checkerboard.
