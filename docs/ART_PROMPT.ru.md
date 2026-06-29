# Промпт на все арты (Tower Clash)

Документ для генерации артов в нейросети. Решения по объёму:
**~80 уникальных карт** (общий пул), из которых собираются **10 тематических колод
по 24 карты** (карты переиспользуются между колодами). Анимация — **статичная
вырезка на юнита + анимация в движке** (без покадровых спрайт-листов).

> **Важно (оригинальность):** весь арт — оригинальный. НИКАКИХ персонажей, названий,
> логотипов и узнаваемых элементов Clash Royale / Supercell. Свой стиль, свои имена.

## TL;DR — что нужно (итого ~218 файлов)
| Категория | Кол-во | Папка | Размер на выходе |
|---|---|---|---|
| Портреты карт | 80 | `art/incoming/cards/` | 256×320 (вертикаль) |
| Боевые вырезки юнитов | ~67 (войска+здания, БЕЗ заклинаний) | `art/incoming/units/` | 128×128 (прозрач.) |
| Арены/поля | 10 | `art/incoming/arena/` | 540×900 (18:30) |
| Фон хаба/меню | 1 | `art/incoming/arena/` | 1080×1920 |
| Башни | 2 (king, princess) | `art/incoming/towers/` | 192×192 |
| Боссы | 1 (+ до 10 опц.) | `art/incoming/boss/` | 320×320 |
| Эффекты (VFX) | ~16 | `art/incoming/fx/` *(новая)* | 128×128 (прозрач.) |
| UI-иконки | ~40 | `art/incoming/ui/` | 64×64 / по месту |
| Логотип | 1 (+ иконка/сплеш) | `art/incoming/logo/` | до 1280px |

---

## 1. Как пользоваться
1. Имя файла **без расширения = id** ассета (см. таблицы ниже). Пример: `flame_knight.png`.
2. Раскладываешь файлы по папкам `art/incoming/<категория>/`, коммитишь/пушишь
   (или скидываешь мне).
3. Я запускаю `npm run slice` — он обрежет/нормализует под нужный размер и
   соберёт `client/public/assets/manifest.json`. Чего нет — остаётся плейсхолдер,
   так что можно лить частями.
4. Формат: **PNG с прозрачностью** (для юнитов/VFX/UI — обязательно), для арен можно JPG.

---

## 2. Базовый стиль (вставлять в КАЖДУЮ генерацию)
Промпты для генератора лучше работают на английском — даю готовый текст.

**MASTER STYLE (prefix):**
```
mobile game art, original IP, stylized 3D cartoon, hand-painted PBR look,
chunky proportions, bold clean silhouette, warm rim light, soft ambient occlusion,
vibrant saturated colors, high readability at small size, centered single subject,
no text, no logo, no watermark, no UI, plain background
```

**NEGATIVE (prefix):**
```
text, letters, watermark, signature, logo, brand, Clash Royale, Supercell,
multiple subjects, collage, frame, border, busy background, photoreal, gore,
low contrast, blurry, extra limbs, cut off
```

**Глобальные правила:**
- Один субъект в кадре, по центру, целиком в кадре (не обрезан).
- Для вырезок/VFX/UI — **полностью прозрачный фон** (alpha), без тени на фоне
  (мягкая тень допускается как часть субъекта, но лучше без неё — движок рисует свою).
- Единый «возраст»/детализация стиля у всех карт, чтобы коллекция смотрелась цельно.

---

## 3. Спеки и шаблоны по категориям

### 3.1 Портреты карт — `cards/<id>.png`, 256×320 (вертикаль)
Парадный портрет существа/объекта карты по пояс/в полный рост, динамичная поза,
без рамки и текста (рамку/стоимость/имя рисует игра).
**Шаблон:**
```
<MASTER STYLE>, character portrait of <VISUAL>, dynamic heroic pose,
3/4 front view, dramatic lighting, vertical composition, transparent background
```

### 3.2 Боевые вырезки — `units/<id>.png`, 128×128 (прозрач.)
**Те же id, что у карт** (войска и здания). У заклинаний вырезки НЕТ.
Вид сверху-сбоку (top-down 3/4, «как смотрит игрок на поле»), фигура стоит,
ноги у нижнего края, нейтральная поза покоя (idle) — движок сам делает покачивание,
ход, выпад при атаке, вспышку при уроне и падение при смерти.
**Требования к вырезке (чтобы движок красиво анимировал):**
- строго прозрачный фон, вертикально стоящая фигура, центр по горизонтали;
- «точка опоры» (ноги/основание) у низа кадра; смотрит вперёд/вниз-вперёд;
- читаемый силуэт, без обрезки конечностей, без своей тени на земле.
**Шаблон:**
```
<MASTER STYLE>, top-down three-quarter game sprite of <VISUAL>, full body,
standing idle pose, facing camera-forward, feet at bottom, transparent background,
no ground shadow
```
Для зданий: `compact defensive structure of <VISUAL>, top-down 3/4, transparent background`.

### 3.3 Арены/поля — `arena/<id>.png`, 540×900 (18:30, вертикаль)
Фон поля боя СВЕРХУ ВНИЗ: верхняя половина — сторона врага, нижняя — твоя, посередине
река с двумя мостами, клетчатая трава/грунт. **Башни НЕ рисовать** (их рисует движок,
они разрушаемы). Без юнитов и UI. По одной на каждую лигу/тему.
**Шаблон:**
```
<MASTER STYLE>, top-down battlefield background, two mirrored halves divided by a
river with two wooden bridges, subtle checkerboard tiles, <THEME biome>, empty arena,
no towers, no characters, no UI, vertical 18:30
```

### 3.4 Хаб/меню — `arena/hub_bg.png`, 1080×1920
Парадный фон главного экрана (замок/арена издалека, небо), затемняемый в движке.

### 3.5 Башни — `towers/king.png` и `towers/princess.png`, 192×192
Нейтральный камень/кладка, вид сверху-сбоку; движок подкрашивает сторону (синий —
ты, красный — враг). King — крупнее, с короной; princess — компактная башенка с
лучницей-турелью (силуэт, без бренда). Прозрачный фон.

### 3.6 Боссы — `boss/boss.png`, 320×320 (+ опц. `boss_<theme>.png`)
Огромный угрожающий монстр для клан-рейда, вид сверху-сбоку, по центру, прозрачный фон.

### 3.7 Эффекты VFX — `fx/<id>.png`, 128×128 (прозрач., аддитивные)
Статичные спрайты, которые движок масштабирует/крутит/гасит:
`hit_slash, explosion, fireball, frostbolt, lightning_arc, arrow, cannonball,
heal_sparkle, poison_cloud, shield_aura, rage_aura, freeze_crystal, dust_puff,
star_bolt, smoke_ring, deploy_ring`.
**Шаблон:** `<MASTER STYLE>, game VFX sprite of <VISUAL>, glowing, on transparent background, additive`.

### 3.8 UI-иконки — `ui/<id>.png`, 64×64 (или по месту)
`elixir, gold, gem, trophy, crown, xp, star, lock,
chest_wood, chest_silver, chest_gold, chest_magic, chest_legendary,
badge_1 … badge_10` (значки лиг/арен), `medal_bronze, medal_silver, medal_gold,
clan_badge, vs_banner, timer, emote_1 … emote_8,
frame_common, frame_rare, frame_epic, frame_legendary, card_back`.
**Шаблон:** `<MASTER STYLE>, single game UI icon of <VISUAL>, centered, transparent background, crisp`.

### 3.9 Логотип — `logo/logo.png` (до 1280px) + `ui/app_icon.png` (512×512) + `arena/splash.png` (1080×1920)
Эмблема/название игры (наш бренд), сплеш-экран загрузки, иконка приложения.

---

## 4. Ростер карт — 80 шт. (10 тем × 8)
Колонки: **id** · Name · Rarity · Type · Role · Cost · Visual (англ., для шаблона).
Rarity: C=common, R=rare, E=epic, L=legendary.

### Тема 1 — Training Grounds (база/нейтральные)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| footman | Footman | C | troop | Warrior | 3 | young swordsman, leather armor, round shield |
| recruit | Recruit | C | troop | Swarm | 2 | pair of spear militia in tan tunics |
| archers | Archers | C | troop | Ranged | 3 | two hooded bow-women in green |
| ratpack | Rat Pack | C | troop | Swarm | 2 | cluster of scrappy rat-folk with daggers |
| bombthrower | Bomb Thrower | R | troop | Splash | 4 | stout sapper lobbing a round bomb |
| sharpshooter | Sharpshooter | R | troop | Ranged | 4 | markswoman with a long musket |
| bastion | Bastion | C | building | Defense | 5 | squat stone bunker with an arrow slit |
| volley | Volley | R | spell | Spell | 3 | fan of arrows raining down |

### Тема 2 — Forest Clearing (природа/лес)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| thornling | Thornling | C | troop | Swarm | 2 | three tiny bramble sprites |
| wolfpack | Wolf Pack | C | troop | Swarm | 3 | three grey wolves |
| boarrider | Boar Rider | R | troop | Charger | 4 | tusked boar with a goblin rider |
| druidess | Druidess | R | troop | Healer | 4 | antlered woman channeling green light |
| beehive | Beehive | C | building | Spawner | 5 | hollow log spitting hornets |
| entangle | Entangle | R | spell | Control | 2 | roots and vines snaring an area |
| treant | Treant | E | troop | Tank | 6 | walking oak giant with mossy bark |
| greenwarden | Greenwarden | L | troop | Bruiser | 5 | leafy stag-knight with a living shield |

### Тема 3 — Stone Fort (оборона/рыцари/здания)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| shieldguard | Shieldguard | C | troop | Warrior | 3 | knight with a tall tower shield |
| crossbowman | Crossbowman | R | troop | Ranged | 4 | heavy crossbow soldier |
| battering_ram | Battering Ram | R | troop | Charger | 4 | crew pushing an iron-headed ram |
| cannon_tower | Cannon Tower | C | building | Defense | 4 | small stone cannon turret |
| catapult | Catapult | E | building | Siege | 5 | wooden catapult hurling boulders |
| colossus | Colossus | E | troop | Tank | 6 | towering stone-armored brute |
| ironclad | Ironclad | L | troop | Tank | 7 | colossal plated juggernaut with a greatshield |
| fortify | Fortify | R | spell | Buff | 3 | golden protective shield aura |

### Тема 4 — Fire Forge (огонь/лава)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| emberling | Emberling | C | troop | Swarm | 2 | pair of little fire imps |
| flame_knight | Flame Knight | R | troop | Warrior | 4 | knight wreathed in flame, molten sword |
| pyromancer | Pyromancer | R | troop | Splash | 4 | robed caster flinging fireballs |
| forge_turret | Forge Turret | C | building | Defense | 4 | brazier turret spitting fire bolts |
| magmaback | Magmaback | E | troop | Tank | 6 | lava-shelled tortoise beast |
| meteor | Meteor | E | spell | Damage | 5 | flaming rock smashing down |
| infernal_hound | Infernal Hound | L | troop | Charger | 4 | three-headed lava hound |
| firestorm | Firestorm | R | spell | DoT | 4 | rolling wall of fire |

### Тема 5 — Frost Peak (лёд/снег)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| frostling | Frostling | C | troop | Swarm | 2 | trio of snow sprites |
| snowball_giant | Snowball Giant | C | troop | Charger | 4 | rolling snowball with stubby arms |
| icebreaker | Icebreaker | R | troop | Warrior | 4 | burly viking with an ice axe |
| frost_archer | Frost Archer | R | troop | Ranged | 4 | archer with frost-tipped arrows |
| glacier_wall | Glacier Wall | C | building | Defense | 5 | wall of solid blue ice |
| snow_yeti | Snow Yeti | E | troop | Tank | 6 | white-furred horned yeti |
| winterborn | Winterborn | L | troop | Caster | 5 | ice sorceress trailing frost |
| blizzard | Blizzard | R | spell | Slow | 3 | swirling snowstorm |

### Тема 6 — Storm Arena (молния/воздух/небо)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| zaplet | Zaplet | C | troop | Swarm | 2 | two crackling spark elementals |
| stormcrow | Storm Crow | C | troop | Air | 3 | flock of three storm crows |
| skylancer | Skylancer | R | troop | Air | 4 | winged lancer riding a gust |
| galestrike | Galestrike | R | spell | Knockback | 3 | gust of wind knocking back |
| windmill_tower | Windmill Tower | C | building | Spawner | 5 | windmill spawning paper gliders |
| thunder_mage | Thunder Mage | E | troop | Chain | 5 | mage chaining lightning bolts |
| tempest_djinn | Tempest Djinn | L | troop | Air | 6 | swirling air genie |
| chain_bolt | Chain Bolt | R | spell | Chain | 2 | lightning arc jumping between targets |

### Тема 7 — Royal Court (королевские/кавалерия)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| lancer_knight | Lancer Knight | C | troop | Charger | 3 | mounted lancer with a pennant |
| royal_guard | Royal Guard | C | troop | Warrior | 4 | halberd palace guard |
| trumpeter | Trumpeter | R | troop | Buff | 3 | herald whose horn rallies allies |
| crown_ballista | Crown Ballista | R | building | Siege | 4 | gilded ballista |
| blademaster | Blademaster | E | troop | Warrior | 4 | dual-sword duelist |
| duchess | Duchess | E | troop | Support | 5 | noblewoman with a flintlock and banner |
| paladin | Paladin | L | troop | Bruiser | 6 | golden holy knight on a warhorse |
| royal_decree | Royal Decree | R | spell | Rage | 4 | golden rally banner aura |

### Тема 8 — Shadow Marsh (яд/болото/нежить)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| bogling | Bogling | C | troop | Swarm | 2 | three muck goblins |
| wraith | Wraith | R | troop | Assassin | 3 | floating ghostly reaper |
| plague_doctor | Plague Doctor | R | troop | Poison | 4 | masked alchemist hurling vials |
| bonepile | Bonepile | C | building | Spawner | 4 | skull mound spawning skeletons |
| necromancer | Necromancer | E | troop | Spawner | 5 | robed summoner raising bones |
| swamp_hulk | Swamp Hulk | E | troop | Tank | 6 | bloated bog troll |
| lich_king | Lich King | L | troop | Caster | 6 | crowned undead sorcerer |
| venom_cloud | Venom Cloud | R | spell | DoT | 4 | lingering green poison gas |

### Тема 9 — Desert Sands (песок/скорпионы/мумии)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| sandling | Sandling | C | troop | Swarm | 2 | pair of sand imps |
| scarab_swarm | Scarab Swarm | C | troop | Swarm | 3 | skittering beetle cluster |
| mummy_lord | Mummy Lord | R | troop | Warrior | 4 | bandaged khopesh warrior |
| oasis_shrine | Oasis Shrine | C | building | Healer | 5 | fountain that heals nearby allies |
| scorpion_queen | Scorpion Queen | E | troop | Ranged | 5 | giant scorpion with a venom tail |
| sand_golem | Sand Golem | E | troop | Tank | 6 | crumbling sandstone giant |
| mirage_assassin | Mirage Assassin | L | troop | Assassin | 4 | veiled blade-dancer that blinks |
| sandstorm | Sandstorm | R | spell | Slow | 4 | choking dust cloud |

### Тема 10 — Legend League (легендарные/капстоны)
| id | Name | R | Type | Role | Cost | Visual |
|---|---|---|---|---|---|---|
| runestone | Runestone | C | building | Defense | 4 | glowing rune obelisk turret |
| starcaller | Starcaller | R | troop | Caster | 5 | astral mage summoning star bolts |
| gryphon_rider | Gryphon Rider | E | troop | Air | 5 | knight riding a gryphon |
| arch_templar | Arch Templar | E | troop | Bruiser | 6 | radiant plated paladin-lord |
| valkyrie_prime | Valkyrie Prime | L | troop | Splash | 5 | spinning winged shieldmaiden |
| titan_golem | Titan Golem | L | troop | Tank | 8 | mountain-sized rune golem |
| celestial_beam | Celestial Beam | E | spell | Damage | 6 | column of holy light |
| worldtree_sap | Worldtree Sap | R | spell | Heal | 3 | golden healing rain |

> **Заклинания (нет вырезки в `units/`):** volley, entangle, fortify, meteor,
> firestorm, blizzard, galestrike, chain_bolt, royal_decree, venom_cloud, sandstorm,
> celestial_beam, worldtree_sap (13 шт). Остальные 67 — войска/здания → нужна вырезка.

---

## 5. 10 колод по 24 карты (сборка из пула)
Каждая колода = **8 «своих» тематических карт** (из таблицы темы выше) + **16 общих**
из пула (миксуем коммоны/спеллы/здания других тем под идею колоды). Названия колод:
1. Greenwood Rush (Тема 2) · 2. Stonewall Siege (Тема 3) · 3. Molten Onslaught (Тема 4)
· 4. Frostbite Control (Тема 5) · 5. Stormcallers (Тема 6) · 6. Royal Vanguard (Тема 7)
· 7. Plaguebringers (Тема 8) · 8. Desert Kings (Тема 9) · 9. Legends’ Pantheon (Тема 10)
· 10. Trial Squad (Тема 1, стартовая).

> Для артов это ничего не добавляет — все 80 карт уже перечислены. Колоды влияют
> только на геймплей (сборку), и я подключу их при ребалансе каталога.

---

## 6. Арены — 10 шт. `arena/<id>.png` (по теме лиги)
`arena_training, arena_forest, arena_stonefort, arena_fireforge, arena_frostpeak,
arena_storm, arena_royal, arena_marsh, arena_desert, arena_legend`.
Биом подставляешь в шаблон 3.3 (forest glade / stone fortress yard / volcanic forge /
snowy peak / stormy sky platform / royal courtyard / poison swamp / desert ruins /
celestial temple). **Без башен и юнитов.**

---

## 7. Башни и боссы
- `towers/king.png`, `towers/princess.png` — см. 3.5.
- `boss/boss.png` — главный рейд-босс (напр. «Obsidian Colossus» — огромный
  обсидиановый голем с трещинами-лавой). Опционально позже — по боссу на тему.

---

## 8. VFX (`fx/`) и UI (`ui/`)
Списки — в разделах 3.7 и 3.8. Это мелкие прозрачные спрайты; движок их крутит/
масштабирует/гасит, поэтому покадровка не нужна.

---

## 9. Анимация (важно при статике)
Мы НЕ генерим кадры. Каждая боевая вырезка — одна нейтральная поза, а движок делает:
покачивание (idle), шаг при движении, выпад/отдачу при атаке, вспышку белым при уроне,
затухание/опрокидывание при смерти, кольцо при установке (`fx/deploy_ring`).
Поэтому от вырезки нужно: прозрачный фон, вертикальная стойка, ноги у низа, центр по
горизонтали, читаемый силуэт, без обрезки и без своей тени. Снаряды и заклинания —
через `fx/` (fireball, arrow, frostbolt, lightning_arc, star_bolt, cannonball …).

---

## 10. Очередность заливки (рекомендую)
1) Башни (2) + 1 арена + boss — сразу оживит бой. 2) 67 вырезок юнитов (по темам).
3) 80 портретов карт. 4) Остальные 9 арен. 5) VFX. 6) UI-иконки. 7) Логотип/сплеш.
Лей частями — недостающее остаётся плейсхолдером.
