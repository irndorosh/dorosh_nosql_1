# MongoDB: Spotify Tracks

Домашнє завдання з NoSQL: завантаження датасету Spotify у MongoDB Atlas, трансформація схеми через
Aggregation Pipeline, аналітичні запити та оптимізація індексами.

Датасет: [Spotify Tracks Dataset](https://www.kaggle.com/datasets/maharshipandya/-spotify-tracks-dataset) —
114 000 рядків, 114 жанрів (по 1000 треків на жанр).

## Структура проєкту

```
.
├── .env                        # MONGO_URI (не в git)
├── dataset.csv                 # датасет з Kaggle (не в git)
├── requirements.txt            # Python-залежності
├── scripts/
│   ├── 01_load_data.py         # CSV → колекція tracks_raw
│   └── 02_transform.js         # tracks_raw → tracks (aggregation pipeline + $out)
├── queries/
│   ├── part2_queries.js        # Частина 2: запити
│   └── part3_indexes.js        # Частина 3: індекси та explain()
└── results/
    ├── part2_output.txt        # повний вивід part2_queries.js
    └── part3_output.txt        # повний вивід part3_indexes.js
```

## 1. Налаштування оточення

### 1.1. Що потрібно встановити

- **Python 3.10+** (перевірено на 3.14)
- **mongosh** — MongoDB Shell, для запуску `.js`-скриптів:
  `brew install mongosh` (macOS) або [завантажити з сайту MongoDB](https://www.mongodb.com/try/download/shell)
- **Кластер MongoDB Atlas** (підійде безкоштовний M0). У *Network Access* має бути дозволено вашу IP-адресу,
  у *Database Access* — створено користувача з правами на читання й запис.

### 1.2. Залежності Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt`:

```
pymongo==4.7.3
pandas==3.0.3
kaggle==1.6.14
python-dotenv==1.0.1
tqdm==4.66.4
```

### 1.3. Файл `.env`

Створіть у корені проєкту файл `.env` з рядком підключення до Atlas
(*Atlas → Connect → Drivers*):

```
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
```

`.env` додано в `.gitignore`, щоб пароль не потрапив у репозиторій.

### 1.4. Датасет

Завантажте `dataset.csv` і покладіть у корінь проєкту. Будь-який із варіантів:

```bash
# через Kaggle CLI (потрібен ~/.kaggle/kaggle.json з API-токеном)
kaggle datasets download -d maharshipandya/-spotify-tracks-dataset --unzip
```

```bash
# або публічне дзеркало того самого файлу на Hugging Face
curl -L -o dataset.csv https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset/resolve/main/dataset.csv
```

### 1.5. Порядок запуску

Скрипти треба запускати саме в такому порядку: кожен наступний працює з колекцією, яку створив попередній.
Усі скрипти ідемпотентні — їх можна безпечно перезапускати (колекції та індекси перед створенням видаляються).

```bash
# завантажити змінні з .env у поточну сесію shell — для mongosh
set -a; source .env; set +a

# 1. CSV → spotify.tracks_raw (~4 хв на M0)
python scripts/01_load_data.py

# 2. tracks_raw → spotify.tracks
mongosh "$MONGO_URI" --file scripts/02_transform.js

# 3. запити Частини 2
mongosh "$MONGO_URI" --file queries/part2_queries.js

# 4. індекси Частини 3
mongosh "$MONGO_URI" --file queries/part3_indexes.js
```

Очікуваний результат кроків 1–2: `Завантажено документів: 113999` та `Документів у tracks: 113999`
(один рядок CSV без виконавця та назви треку відкидається у `01_load_data.py`).

> **Можлива проблема на macOS.** Python, встановлений з python.org, не бачить системних сертифікатів, і
> `01_load_data.py` падає з `SSL: CERTIFICATE_VERIFY_FAILED`. Рішення — вказати сертифікати пакета `certifi`
> (встановлюється разом із залежностями) перед запуском:
>
> ```bash
> export SSL_CERT_FILE=$(python -m certifi)
> ```
>
> або один раз запустити `/Applications/Python 3.x/Install Certificates.command`.

## 2. Схема даних

### 2.1. Сирі дані — `tracks_raw`

Плоска копія CSV: 21 поле в корені документа, виконавці — один рядок через `;`.

```js
{
  _id: ObjectId('...'),
  'Unnamed: 0': 0,                       // індекс рядка з CSV, у tracks не переноситься
  track_id: '5SuOikwiRyPMVoIQDJUgSV',
  artists: 'Gen Hoshino',                // рядок, кілька виконавців — через ';'
  album_name: 'Comedy',
  track_name: 'Comedy',
  popularity: 73, duration_ms: 230666, explicit: false,
  danceability: 0.676, energy: 0.461, key: 1, loudness: -6.746, mode: 0,
  speechiness: 0.143, acousticness: 0.0322, instrumentalness: 1.01e-06,
  liveness: 0.358, valence: 0.715, tempo: 87.917, time_signature: 4,
  track_genre: 'acoustic'
}
```

### 2.2. Підсумкова схема — `tracks`

Приклад документа (вивід `02_transform.js`):

```json
{
  "_id": { "$oid": "6ae75099133b1a6ea2562adb" },
  "track_id": "5SuOikwiRyPMVoIQDJUgSV",
  "track_name": "Comedy",
  "album_name": "Comedy",
  "artists": ["Gen Hoshino"],
  "track_genre": "acoustic",
  "explicit": false,
  "popularity": 73,
  "popularity_tier": "high",
  "duration_ms": 230666,
  "duration_sec": 230.7,
  "audio_features": {
    "danceability": 0.676,
    "energy": 0.461,
    "loudness": -6.746,
    "speechiness": 0.143,
    "acousticness": 0.0322,
    "instrumentalness": 0.00000101,
    "liveness": 0.358,
    "valence": 0.715,
    "tempo": 87.917,
    "key": 1,
    "mode": 0,
    "time_signature": 4
  }
}
```

| Поле | Тип | Опис |
|---|---|---|
| `_id` | ObjectId | Новий ідентифікатор, створений `$out` |
| `track_id` | string | Spotify ID треку. **Не унікальний**: той самий трек може бути в кількох жанрах (89 740 унікальних `track_id` на 113 999 документів) |
| `track_name`, `album_name` | string | Назва треку та альбому |
| `artists` | array&lt;string&gt; | Виконавці; отримано з рядка `"A;B"` через `$split` + `$trim`. 30 075 треків мають більше одного виконавця, максимум — 38 |
| `track_genre` | string | Жанр (114 значень) |
| `explicit` | bool | Наявність explicit-контенту |
| `popularity` | int | Популярність 0–100 |
| `popularity_tier` | string | **Обчислюване**: `high` (≥ 70) — 5 472, `medium` (40–69) — 43 115, `low` (< 40) — 65 412 документів |
| `duration_ms` | int | Тривалість у мілісекундах |
| `duration_sec` | double | **Обчислюване**: `duration_ms / 1000`, округлене до 0.1 |
| `audio_features` | object | **Вкладений об'єкт** з 12 аудіохарактеристиками Spotify (див. нижче) |

Поля `audio_features`: `danceability`, `energy`, `speechiness`, `acousticness`, `instrumentalness`,
`liveness`, `valence` — числа 0.0–1.0; `loudness` — гучність у дБ (від −60 до ~0); `tempo` — BPM;
`key` — тональність 0–11; `mode` — 1 = мажор, 0 = мінор; `time_signature` — розмір такту.

### 2.3. Що робить трансформація (`02_transform.js`)

1. **`$project`** — залишає потрібні поля, прибирає `_id` (щоб `$out` створив нові) і службове `Unnamed: 0`,
   перейменовує `artists` → `artists_raw`.
2. **`$addFields` + `$split` + `$map`/`$trim`** — `"Drake; Future"` → `["Drake", "Future"]`.
3. **`$addFields`** — збирає 12 аудіополів в об'єкт `audio_features`, рахує `duration_sec`
   (`$round` + `$divide`) і `popularity_tier` (`$switch`).
4. **`$unset`** — видаляє `artists_raw` і плоскі копії аудіополів.
5. **`$out: "tracks"`** — записує результат у нову колекцію (замінює її, якщо вона існує).

Уся трансформація виконується на сервері MongoDB одним pipeline, без вивантаження даних у Python.

## 3. Частина 1 — Теоретичні питання

### 3.1. Чому аудіохарактеристики винесені в окремий об'єкт `audio_features`, а не зберігаються плоско? Коли таке вкладення вигідне, а коли створює проблеми?

У `tracks_raw` 21 поле лежить в одному рівні, і метадані треку (`track_name`, `album_name`, `popularity`)
перемішані з технічними параметрами звуку (`danceability`, `loudness`, `tempo`…). Ці 12 параметрів описують
одну річ — *як звучить трек*: вони приходять з одного джерела (Spotify Audio Features API),
завжди є в кожного треку і використовуються разом. Тому логічно оформити їх як одну сутність.

**Що це дає в нашій схемі:**

- **Документ легше читати.** У корені `tracks` залишилися поля, які описують трек «для людини»
  (`track_name`, `artists`, `track_genre`, `popularity_tier`), а все про звук — в `audio_features`.
- **Простіші проєкції.** Щоб отримати всі характеристики, достатньо `{ audio_features: 1 }`, а щоб
  відкинути їх зі списку треків — `{ audio_features: 0 }`, без переліку 12 полів.
  У Частині 2 (Завдання 3) потрібна була лише одна характеристика — і результат виглядає структуровано:
  `audio_features: { tempo: 182.379 }`, одразу видно, що це за величина.
- **Роботу з групою як з цілим.** Об'єкт можна передати в `$replaceWith`, `$mergeObjects`, порівняти
  треки за всім набором характеристик, описати однією `$jsonSchema`-валідацією або замінити одним `$set`.
- **Відповідність моделі в коді.** У застосунку це зазвичай окремий клас `AudioFeatures`, і документ
  відображається на нього без перетворень.
- **Розширюваність.** Якщо Spotify додасть нову характеристику, вона природно ляже в `audio_features`, не
  засмічуючи корінь документа.

**Коли вкладення вигідне:**

- зв'язок **«один до одного»** з батьківським документом: у кожного треку рівно один набір характеристик;
- дані **читаються разом з батьком** і не потрібні окремо — ніхто не шукає «аудіохарактеристики без треку»;
- об'єкт **малий і фіксованого розміру** (12 чисел), тому немає ризику наблизитися до ліміту 16 МБ на документ;
- поля **часто запитуються/оновлюються разом**.

**Коли вкладення створює проблеми:**

- **Довші шляхи.** У запитах та індексах треба писати `"audio_features.danceability"` (обов'язково в лапках),
  а не просто `danceability`. Це видно в усіх запитах Частини 2 і в індексах Частини 3.
- **Пастка точного збігу.** `find({ audio_features: { energy: 0.8 } })` шукає документ, у якого
  `audio_features` *повністю* дорівнює `{ energy: 0.8 }` (з тим самим набором і порядком полів), — і не
  знайде нічого. Для умови на одне поле потрібна dot-нотація: `{ "audio_features.energy": 0.8 }`.
- **Ризик перезапису.** `$set: { audio_features: { energy: 0.9 } }` замінить увесь об'єкт і зітре інші
  11 полів. Точкове оновлення: `$set: { "audio_features.energy": 0.9 }`.
- **Ростучі або спільні дані.** Якщо вкладений масив росте необмежено (наприклад, історія всіх
  прослуховувань), документ розбухає і може перевищити 16 МБ. Якщо ті самі дані спільні для багатьох
  документів (наприклад, профіль артиста в кожному треку) — їх доведеться оновлювати в тисячах місць.
  У таких випадках краще окрема колекція і посилання.
- **Надмірна вкладеність** (3–4 рівні, масиви в масивах) ускладнює агрегації (`$unwind`, `$map`) і
  робить індекси multikey, а такі індекси не підтримують покривні запити (див. 5.3).

### 3.2. Чому виконавці зберігаються як масив, а не як рядок? Які запити стають простішими?

У CSV (і в `tracks_raw`) виконавці — це один рядок: `"Ingrid Michaelson;ZAYN"`. Для MongoDB це просто
текст, вона не знає, що всередині кілька імен. У `tracks` це масив `["Ingrid Michaelson", "ZAYN"]`, і
кожне ім'я стає окремим значенням, з яким база вміє працювати нативно. Таких треків із кількома
виконавцями в датасеті 30 075 — понад чверть колекції, тож це не рідкісний випадок.

**Конкретний приклад, чому рядок дає неправильні результати.** Пошук треків Drake за підрядком у
`tracks_raw`:

```js
db.tracks_raw.countDocuments({ artists: /Drake/ })   // 66 — серед них треки "Nick Drake"!
db.tracks.countDocuments({ artists: "Drake" })       // 50 — лише треки саме Drake
```

Щоб regex був коректним, його треба писати як `/(^|;)\s*Drake\s*(;|$)/` — це складно, легко помилитися,
і такий запит не може ефективно використати індекс (повний перебір рядків).

**Які запити стають простішими з масивом:**

| Задача | Рядок `"Drake;Future"` | Масив `["Drake", "Future"]` |
|---|---|---|
| Усі треки артиста | складний regex, ризик хибних збігів | `{ artists: "Drake" }` — збіг з будь-яким елементом масиву |
| Спільні треки двох артистів | два regex через `$and` | `{ artists: { $all: ["Drake", "Future"] } }` |
| Треки будь-кого зі списку | regex з альтернативами | `{ artists: { $in: ["Drake", "Future"] } }` |
| Тільки колаборації | рахувати `;` у рядку | `{ "artists.1": { $exists: true } }` або `$size` |
| Головний виконавець | `$split` + `$arrayElemAt` у кожному запиті | `"artists.0"` |
| Кількість виконавців | `$size` від `$split` | `{ $size: "$artists" }` |
| Статистика по кожному артисту | `$split` → `$unwind` у кожному запиті | одразу `$unwind: "$artists"` → `$group` (Частина 2, Завдання 2) |
| Індекс | індекс по всьому рядку не допомагає знайти одного артиста | **multikey-індекс** `{ artists: 1 }` індексує кожне ім'я окремо |

Крім того, нормалізація (`$trim` пробілів навколо імен) виконана **один раз** під час трансформації, а не в
кожному запиті. Без масиву Завдання 2 Частини 2 вимагало б розбирати рядок `$split`-ом у самому запиті.

## 4. Частина 2 — Запити

Файл: [queries/part2_queries.js](queries/part2_queries.js), повний вивід —
[results/part2_output.txt](results/part2_output.txt).

> **Про дублікати.** Датасет зібраний «по жанрах»: якщо трек належить до кількох жанрів, він присутній кілька
> разів з різним `track_genre` (113 999 документів, але лише 89 740 унікальних `track_id`). Тому в
> Завданнях 1 і 4 той самий трек може з'явитися кілька разів (наприклад, `LOKERA` у жанрах `latin` і
> `latino`) — це окремі документи колекції, і запити повертають їх коректно. Там, де дублікати
> **спотворюють результат** (підрахунок треків артиста в Завданні 2), вони прибрані явно.

### 4.1. Завдання 1. Треки для вечірки

```js
const partyFilter = {
  "audio_features.danceability": { $gt: 0.7 },
  "audio_features.energy": { $gt: 0.7 },
  duration_ms: { $gte: 180000, $lte: 300000 }
};

db.tracks
  .find(partyFilter, {
    _id: 0, track_name: 1, artists: 1, track_genre: 1, popularity: 1, duration_sec: 1,
    "audio_features.danceability": 1, "audio_features.energy": 1
  })
  .sort({ popularity: -1 })
  .limit(10);
```

**Як працює:**

- Три умови в одному об'єкті фільтра поєднуються через неявний **AND**.
- «Вище 0.7» — строга нерівність, тому `$gt`, а не `$gte`.
- До вкладених полів звертаємось через dot-нотацію `"audio_features.danceability"`.
- «Від 3 до 5 хвилин» включно — `$gte: 180000` і `$lte: 300000` по `duration_ms`
  (180 000 мс = 3 хв, 300 000 мс = 5 хв). Дві умови на одне поле в одному об'єкті — це діапазон.
- Проєкція залишає лише поля, корисні для перевірки результату; сортування за популярністю й `limit(10)` —
  щоб показати найпопулярніші треки, а загальна кількість рахується `countDocuments` з тим самим фільтром.

**Результат:** 7 311 документів (5 328 унікальних треків). Найпопулярніші:

| track_name | artists | genre | popularity | danceability | energy | duration_sec |
|---|---|---|---|---|---|---|
| Calm Down (with Selena Gomez) | Rema, Selena Gomez | pop | 92 | 0.801 | 0.806 | 239.3 |
| LOKERA | Rauw Alejandro, Lyanno, Brray | latin | 91 | 0.834 | 0.828 | 195.3 |

Усі значення в виводі задовольняють умовам: danceability і energy > 0.7, тривалість 180–300 с.

### 4.2. Завдання 2. Виконавці, у яких усі треки популярні

```js
db.tracks.aggregate([
  { $unwind: "$artists" },
  {
    $group: {
      _id: { artist: "$artists", track_id: "$track_id" },
      popularity: { $min: "$popularity" }
    }
  },
  {
    $group: {
      _id: "$_id.artist",
      track_count: { $sum: 1 },
      min_popularity: { $min: "$popularity" },
      avg_popularity: { $avg: "$popularity" }
    }
  },
  { $match: { track_count: { $gte: 3 }, min_popularity: { $gte: 60 } } },
  { $sort: { avg_popularity: -1, track_count: -1, _id: 1 } },
  { $limit: 20 },
  {
    $project: {
      _id: 0,
      artist: "$_id",
      track_count: 1,
      min_popularity: { $round: ["$min_popularity", 1] },
      avg_popularity: { $round: ["$avg_popularity", 1] }
    }
  }
]);
```

**Як працює, стадія за стадією:**

1. **`$unwind: "$artists"`** — розгортає масив: трек з двома виконавцями стає двома документами, по одному
   на виконавця. Так колаборація зараховується кожному з учасників. Тут видно перевагу масиву з
   питання 3.2 — з рядком довелося б спершу робити `$split`.
2. **Перший `$group` по (артист, `track_id`)** — прибирає дублікати треку з різних жанрів. Без цього кроку
   артист з **одним** треком, що є в трьох жанрах, отримав би `track_count: 3` і помилково пройшов би фільтр
   «мінімум 3 треки». Перевірка: без дедуплікації умову проходять 334 артисти, з дедуплікацією — 170, тобто
   половина результату була б хибною. У 720 треків `popularity` у дублікатах різна (Spotify оновлював дані між
   вибірками жанрів) — беремо `$min`, щоб перевірка «всі треки популярні» була суворою.
3. **Другий `$group` по артисту** — рахує кількість унікальних треків (`$sum: 1`), мінімальну (`$min`) і
   середню (`$avg`) популярність.
4. **`$match`** — фільтр **після** групування, бо умови стосуються агрегатів:
   `track_count >= 3` і `min_popularity >= 60`. Популярність у датасеті — шкала 0–100, тож «60 % або вище»
   означає значення ≥ 60. Умова на **мінімум** гарантує, що популярні *усі* треки артиста.
5. **`$sort`** — «топ» визначаємо за середньою популярністю; при рівності — за кількістю треків, далі за
   іменем, щоб порядок був детермінованим.
6. **`$limit: 20`** і **`$project`** — топ-20, перейменування `_id` → `artist`, `$round` до одного знака.

**Результат** (усього артистів, що задовольняють умову, — 170):

| # | artist | track_count | min_popularity | avg_popularity |
|---|---|---|---|---|
| 1 | Harry Styles | 3 | 89 | 92 |
| 2 | Olivia Rodrigo | 5 | 86 | 87.4 |
| 3 | IVE | 3 | 79 | 84 |
| 4 | Morgan Wallen | 3 | 81 | 83.3 |
| 5 | One Direction | 5 | 80 | 83 |
| 6 | Lil Nas X | 8 | 77 | 82.8 |
| 7 | Måneskin | 5 | 76 | 82.6 |
| 8 | TV Girl | 3 | 80 | 81.7 |
| 9 | Mora | 6 | 69 | 80.3 |
| 10 | Luke Combs | 3 | 79 | 80.3 |
| 11 | Maroon 5 | 3 | 70 | 79.7 |
| 12 | Mitski | 6 | 75 | 78.3 |
| 13 | Mark Ronson | 3 | 74 | 78.3 |
| 14 | LE SSERAFIM | 4 | 75 | 78 |
| 15 | Beach Bunny | 3 | 73 | 78 |
| 16 | Shubh | 5 | 69 | 77.8 |
| 17 | SZA | 4 | 65 | 77.8 |
| 18 | Jhay Cortez | 3 | 75 | 77.7 |
| 19 | Mother Mother | 3 | 76 | 77.3 |
| 20 | Tiago PZK | 4 | 72 | 77 |

**Ручна перевірка першого рядка:** `db.tracks.find({ artists: "Harry Styles" })` повертає 3 документи —
«As It Was» (95), «Watermelon Sugar» (89) і ще одна версія «As It Was» з іншим `track_id` (92).
min = 89, avg = (95 + 89 + 92) / 3 = 92 — збігається з результатом агрегації.

### 4.3. Завдання 3. Нетипові треки

```js
db.tracks.aggregate([
  {
    $setWindowFields: {
      partitionBy: "$track_genre",
      output: {
        avg_tempo: { $avg: "$audio_features.tempo" },
        std_tempo: { $stdDevPop: "$audio_features.tempo" }
      }
    }
  },
  {
    $addFields: {
      outlier_threshold: { $add: ["$avg_tempo", { $multiply: [2, "$std_tempo"] }] }
    }
  },
  { $match: { $expr: { $gt: ["$audio_features.tempo", "$outlier_threshold"] } } },
  { $sort: { "audio_features.tempo": -1 } },
  {
    $group: {
      _id: "$track_genre",
      avg_tempo: { $first: "$avg_tempo" },
      outlier_threshold: { $first: "$outlier_threshold" },
      outlier_tracks: {
        $push: {
          _id: "$_id",
          track_name: "$track_name",
          popularity: "$popularity",
          artists: "$artists",
          audio_features: { tempo: "$audio_features.tempo" }
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      avg_tempo: { $round: ["$avg_tempo", 1] },
      genre: "$_id",
      outlier_threshold: { $round: ["$outlier_threshold", 1] },
      outlier_tracks: "$outlier_tracks"
    }
  },
  { $sort: { genre: 1 } }
]);
```

**Як працює:**

1. **`$setWindowFields` з `partitionBy: "$track_genre"`** — рахує `$avg` і `$stdDevPop` темпу в межах
   жанру і **дописує їх до кожного треку**, не згортаючи документи. Це головна перевага над звичайним
   `$group`: після `$group` треки зникли б, і довелося б або збирати всі 1000 треків жанру в масив
   (`$push: "$$ROOT"`), або робити `$lookup` колекції на саму себе.
   `$stdDevPop` (а не `$stdDevSamp`) — бо ми рахуємо по всій сукупності треків жанру, як вимагає завдання.
2. **`$addFields`** — поріг `mean + 2 · stdDev` для кожного треку (однаковий у межах жанру).
3. **`$match` з `$expr`** — порівнює **два поля одного документа** (`tempo` і `outlier_threshold`); звичайний
   `$match` вміє порівнювати поле лише з константою, тому потрібен `$expr`.
4. **`$sort` за tempo** перед групуванням — щоб у масиві `outlier_tracks` треки йшли від найшвидшого.
5. **`$group` по жанру** — збирає нетипові треки в масив; `avg_tempo` і `outlier_threshold` однакові для всіх
   треків жанру, тому достатньо `$first`. Вкладений об'єкт `audio_features: { tempo }` повторює формат з
   прикладу в завданні.
6. **`$project`** — порядок і назви полів як у прикладі, `$round` до одного знака.

**Результат:** нетипові треки знайдено в 112 жанрах із 114, усього 3 506 треків. Перший жанр — точно
збігається з прикладом у завданні:

```js
{
  avg_tempo: 119,
  genre: 'acoustic',
  outlier_threshold: 178.5,
  outlier_tracks: [
    { _id: ObjectId('...'), track_name: 'Fast Car', popularity: 61,
      artists: ['Boyce Avenue', 'Kina Grannis'], audio_features: { tempo: 204.961 } },
    { _id: ObjectId('...'), track_name: 'Running Up That Hill (A Deal With God) - Acoustic', popularity: 51,
      artists: ['Jonah Baker'], audio_features: { tempo: 203.816 } },
    // ...
  ]
}
```

У скрипті для читабельності друкуються перші 3 жанри по 3 треки; повні масиви повертає сам pipeline.

> Зауваження щодо даних: у 157 треків `tempo = 0` (Spotify не зміг визначити темп — зазвичай це шуми,
> аудіокниги, ембієнт). Вони трохи знижують середнє і збільшують відхилення. Завдання вимагає рахувати
> статистику по всіх треках жанру, тому вони не відфільтровані.

### 4.4. Завдання 4. Треки для фонової роботи

```js
const workFilter = {
  "audio_features.loudness": { $lt: -10 },
  "audio_features.speechiness": { $lt: 0.1 },
  "audio_features.instrumentalness": { $gt: 0.5 },
  explicit: false
};

db.tracks
  .find(workFilter, {
    _id: 0, track_name: 1, artists: 1, track_genre: 1, popularity: 1, explicit: 1,
    "audio_features.loudness": 1, "audio_features.speechiness": 1, "audio_features.instrumentalness": 1
  })
  .sort({ popularity: -1 })
  .limit(10);
```

**Як працює:**

- Чотири умови через неявний **AND**.
- **Тихі** — `loudness < -10`: гучність вимірюється в дБ і від'ємна, тож «тихіше» означає «менше» (−14 тихіше
  за −6).
- **Низька мовленнєва складова** — `speechiness < 0.1` (значення < 0.33 у Spotify відповідають музиці без
  мовлення).
- **Переважно інструментальні** — `instrumentalness > 0.5` (за документацією Spotify поріг 0.5 означає
  «ймовірно, без вокалу»).
- **Без explicit** — `explicit: false`. Перевіряємо саме рівність `false`, а не `$ne: true`, бо поле
  булеве і є в кожному документі (тип приведено в `01_load_data.py`).

**Результат:** 9 324 документи (8 311 унікальних треків). Найпопулярніші:

| track_name | artists | genre | loudness | speechiness | instrumentalness |
|---|---|---|---|---|---|
| everything i wanted | Billie Eilish | electro | −14.454 | 0.0994 | 0.657 |
| Clean White Noise - Loopable with no fade | White Noise Baby Sleep, White Noise for Babies | sleep | −28.46 | 0 | 1 |
| Experience | Ludovico Einaudi, Daniel Hope, I Virtuosi Italiani | ambient | −10.634 | 0.0376 | 0.961 |

Усі значення в виводі задовольняють умовам: loudness < −10, speechiness < 0.1, instrumentalness > 0.5,
explicit = false.

## 5. Частина 3 — Індекси та оптимізація

Файл: [queries/part3_indexes.js](queries/part3_indexes.js), повний вивід —
[results/part3_output.txt](results/part3_output.txt).

Скрипт на початку видаляє всі індекси колекції (`dropIndexes()`), щоб «до» завжди означало «без індексу».
Для кожного запиту виконується `explain("executionStats")` — він не лише показує обраний план
(`queryPlanner.winningPlan`), а й реально виконує запит і повертає статистику (`executionStats`).
Допоміжна функція `summarize()` виводить ключові поля:

| Поле `explain()` | Що означає |
|---|---|
| `winningPlan` | Ланцюжок стадій обраного плану (у скрипті — від кореня до листа: `FETCH <- IXSCAN(...)`) |
| `COLLSCAN` | Повний перебір колекції — індексу немає або він не підходить |
| `IXSCAN` (+ `indexName`, `indexBounds`) | Сканування індексу, з якими межами ключів |
| `FETCH` | Читання самих документів за посиланнями з індексу |
| `SORT` | Сортування в пам'яті (ліміт 100 МБ) |
| `PROJECTION_COVERED` | Проєкція побудована лише з ключів індексу, документи не читалися |
| `nReturned` | Скільки документів повернуто |
| `totalKeysExamined` | Скільки ключів індексу переглянуто |
| `totalDocsExamined` | Скільки документів прочитано з колекції |
| `executionTimeMillis` | Час виконання на сервері (мс; змінюється між запусками на кілька мс) |

Ефективний запит — це коли `totalKeysExamined` ≈ `totalDocsExamined` ≈ `nReturned`.

### 5.1. Завдання 1. Запит `pop` + danceability з сортуванням за популярністю

```js
db.tracks.find({
  track_genre: "pop",
  "audio_features.danceability": { $gte: 0.7 }
}).sort({ popularity: -1 }).toArray();
```

#### Крок 1. Без індексу

```js
db.tracks.find(popFilter).sort({ popularity: -1 }).explain("executionStats");
```

```
До створення індексу
{
  winningPlan: 'SORT <- COLLSCAN',
  rejectedPlans: 0,
  nReturned: 354,
  totalKeysExamined: 0,
  totalDocsExamined: 113999,
  executionTimeMillis: 82
}
```

MongoDB переглядає **всі 113 999 документів** (`COLLSCAN`), щоб знайти 354 підхожі, — 99.7 % роботи
марна. Потім знайдені документи сортуються **в пам'яті** (`SORT`). На великих вибірках така стадія може
перевищити ліміт 100 МБ і завершитися помилкою.

#### Крок 2. Індекс

```js
db.tracks.createIndex(
  { track_genre: 1, popularity: -1, "audio_features.danceability": 1 },
  { name: "genre_popularity_danceability" }
);
```

Порядок полів обрано за правилом **ESR (Equality → Sort → Range)**:

1. **E — `track_genre`**: умова рівності. Йде першою — так індекс одразу звужується до одного жанру
   (1000 з 113 999 ключів).
2. **S — `popularity: -1`**: поле сортування, той самий напрям, що в `.sort()`. Усередині
   `track_genre = "pop"` ключі вже впорядковані за спаданням популярності — сортувати не потрібно.
3. **R — `audio_features.danceability`**: діапазон `$gte`. Стоїть останнім: умова перевіряється по ключах
   індексу, і MongoDB відкидає невідповідні записи **до** читання документа.

Чому не `{ track_genre, danceability, popularity }` (поля фільтра підряд)? Тоді індекс був би впорядкований
спершу за danceability, і всередині діапазону `[0.7, 1]` популярність ішла б «шматками» — MongoDB довелося б
знову сортувати в пам'яті (`SORT`).

#### Крок 3. З індексом

```
Після створення індексу
{
  winningPlan: 'FETCH <- IXSCAN(genre_popularity_danceability)',
  rejectedPlans: 0,
  nReturned: 354,
  totalKeysExamined: 412,
  totalDocsExamined: 354,
  executionTimeMillis: 2
}
Знайдено треків: 354
```

Деталі стадії `IXSCAN` із `queryPlanner.winningPlan`:

```js
{
  stage: 'FETCH',
  inputStage: {
    stage: 'IXSCAN',
    indexName: 'genre_popularity_danceability',
    keyPattern: { track_genre: 1, popularity: -1, 'audio_features.danceability': 1 },
    isMultiKey: false,
    direction: 'forward',
    indexBounds: {
      track_genre: [ '["pop", "pop"]' ],
      popularity: [ '[MaxKey, MinKey]' ],
      'audio_features.danceability': [ '[0.7, inf.0]' ]
    }
  }
}
```

#### Що змінилося в плані виконання?

| Показник | До індексу | Після індексу |
|---|---|---|
| План | `SORT` ← `COLLSCAN` | `FETCH` ← `IXSCAN` |
| `nReturned` | 354 | 354 |
| `totalKeysExamined` | 0 | 412 |
| `totalDocsExamined` | **113 999** | **354** |
| `executionTimeMillis` | 82 | 2 |

1. **`COLLSCAN` → `IXSCAN`.** Замість перебору всієї колекції MongoDB переходить в індексі до ключів
   `track_genre = "pop"` (`indexBounds: ["pop", "pop"]`).
2. **Зникла стадія `SORT`.** Результат читається з індексу вже в порядку `popularity` за спаданням
   (`popularity: [MaxKey, MinKey]` — увесь діапазон зверху вниз). Сортування в пам'яті більше немає.
3. **Фільтр за danceability застосовується до ключів.** З 412 переглянутих ключів жанру pop 58 не пройшли
   умову `[0.7, inf.0]` і були відкинуті без читання документа, тому
   `totalDocsExamined = nReturned = 354` — жодного зайвого документа.
4. **Результат той самий** (354 документи), а прочитано документів у **~320 разів менше**; час — з ~80 мс до 2 мс.

#### Як зрозуміти, що індекс використовується?

За полями `explain()`:

- `winningPlan` містить стадію **`IXSCAN`**, а **`COLLSCAN` відсутня**;
- **`indexName: 'genre_popularity_danceability'`** — саме наш індекс;
- **`indexBounds`** відповідають фільтру: `["pop", "pop"]` для рівності, `[0.7, inf.0]` для діапазону;
- **`totalKeysExamined: 412`** — більше нуля, отже ключі індексу читалися;
- **`totalDocsExamined: 354`** замість 113 999 і дорівнює `nReturned`;
- **відсутня стадія `SORT`** — отже, індекс обслуговує і сортування.

У MongoDB Atlas / Compass це ж видно на вкладці **Explain Plan** колекції `spotify.tracks`:
«Query used the following index: genre_popularity_danceability», «Documents Examined: 354»,
«Index Keys Examined: 412», «Sorted in Memory: no».

### 5.2. Завдання 2. Індекс для пошуку музики для роботи

```js
db.tracks.createIndex(
  {
    explicit: 1,
    "audio_features.instrumentalness": 1,
    "audio_features.speechiness": 1
  },
  { name: "explicit_instrumentalness_speechiness" }
);
```

**Чому такий порядок полів:**

- **`explicit`** — умова рівності (`false`), тому перша за ESR.
- Обидва аудіополя — діапазони. Першим іде **більш селективне**: `instrumentalness > 0.5` залишає
  18 850 треків (~17 %), а `speechiness < 0.1` — 90 814 (~80 %). Індекс сканує суцільний діапазон по
  instrumentalness, а умова по speechiness перевіряється по ключах усередині нього. Якби першим стояв
  speechiness, MongoDB сканувала б ~80 % індексу.

Запит для перевірки:

```js
db.tracks.find({
  explicit: false,
  "audio_features.instrumentalness": { $gt: 0.5 },
  "audio_features.speechiness": { $lt: 0.1 }
}).explain("executionStats");
```

```
До створення індексу
{
  winningPlan: 'COLLSCAN',
  rejectedPlans: 0,
  nReturned: 16141,
  totalKeysExamined: 0,
  totalDocsExamined: 113999,
  executionTimeMillis: 140
}

Після створення індексу
{
  winningPlan: 'FETCH <- IXSCAN(explicit_instrumentalness_speechiness)',
  rejectedPlans: 0,
  nReturned: 16141,
  totalKeysExamined: 16602,
  totalDocsExamined: 16141,
  executionTimeMillis: 40
}
```

| Показник | До індексу | Після індексу |
|---|---|---|
| План | `COLLSCAN` | `FETCH` ← `IXSCAN` |
| `totalKeysExamined` | 0 | 16 602 |
| `totalDocsExamined` | 113 999 | 16 141 |
| `executionTimeMillis` | 140 | 40 |

Індекс використовується: у плані `IXSCAN` з `indexName: 'explicit_instrumentalness_speechiness'`, кількість
прочитаних документів упала в 7 разів і дорівнює `nReturned`. Виграш у часі менший, ніж у Завданні 1, бо
запит повертає багато документів (14 % колекції) — їх усе одно треба прочитати й передати.

Повний запит із Частини 2 (Завдання 4, додатково `loudness < -10`) **теж використовує цей індекс**:

```
Запит із Частини 2, Завдання 4 (+ loudness < -10)
{
  winningPlan: 'FETCH <- IXSCAN(explicit_instrumentalness_speechiness)',
  nReturned: 9324,
  totalKeysExamined: 16602,
  totalDocsExamined: 16141
}
```

`IXSCAN` відбирає 16 141 кандидата за трьома полями індексу, а `loudness`, якого в індексі немає,
перевіряється на стадії `FETCH` — після неї залишається 9 324 треки.

### 5.3. Завдання 3. Чи є запит покривним (covered query)?

```js
db.tracks.find({
  track_genre: "pop",
  popularity: { $gte: 70 }
});
```

**Відповідь: ні, у такому вигляді запит не є покривним, хоча й використовує індекс.**

**Покривний запит** — це запит, на який MongoDB відповідає **лише з індексу**, не читаючи жодного документа
з колекції. Для цього мають виконуватися всі умови:

1. усі поля **фільтра** є в індексі;
2. усі поля, які **повертаються**, є в індексі (тобто є проєкція, і вона містить лише поля індексу);
3. `_id` **явно виключений** (`_id: 0`), бо він повертається за замовчуванням, а в нашому індексі його немає;
4. жодне поле індексу не є масивом (`isMultiKey: false`).

Перевіряємо для індексу `{ track_genre: 1, popularity: -1, "audio_features.danceability": 1 }`:

| Умова | Виконується? | Чому |
|---|---|---|
| 1. Поля фільтра в індексі | ✅ | `track_genre` і `popularity` — це **префікс** індексу, тож він підходить: `indexBounds` = `track_genre ["pop","pop"]`, `popularity [inf.0, 70]` |
| 2. Повертаються лише поля індексу | ❌ | Проєкції немає → повертається **весь документ**: `track_name`, `artists`, `album_name`, `audio_features`… Цих полів в індексі немає |
| 3. `_id` виключено | ❌ | Без проєкції `_id` повертається, а в індексі його немає |
| 4. Індекс не multikey | ✅ | Усі три поля — скаляри, `isMultiKey: false` |

Оскільки умови 2–3 не виконуються, для кожного знайденого ключа MongoDB мусить піти в колекцію і прочитати
документ — це стадія `FETCH`. Це підтверджує `explain()`:

```
Без проєкції
{
  winningPlan: 'FETCH <- IXSCAN(genre_popularity_danceability)',
  nReturned: 317,
  totalKeysExamined: 317,
  totalDocsExamined: 317
}
```

`totalDocsExamined: 317 > 0` і стадія `FETCH` — документи читалися, отже запит **не покривний**. При цьому
він ефективний: 317 ключів → 317 документів → 317 результатів, нічого зайвого.

**Як зробити запит покривним** — повертати лише поля з індексу і виключити `_id`:

```js
db.tracks.find(
  { track_genre: "pop", popularity: { $gte: 70 } },
  { _id: 0, track_genre: 1, popularity: 1 }
);
```

```
З проєкцією { _id: 0, track_genre: 1, popularity: 1 }
{
  winningPlan: 'PROJECTION_COVERED <- IXSCAN(genre_popularity_danceability)',
  nReturned: 317,
  totalKeysExamined: 317,
  totalDocsExamined: 0
}
```

Стадія **`PROJECTION_COVERED`** замість `FETCH` і **`totalDocsExamined: 0`** — відповідь повністю зібрана
з ключів індексу. До проєкції можна додати й `"audio_features.danceability": 1`: поле є в індексі та не є
масивом, тому запит теж залишиться покривним (`totalDocsExamined: 0`; у плані тоді `PROJECTION_DEFAULT ←
IXSCAN` без `FETCH`).

Практичний висновок: щойно в проєкцію потрапляє хоча б одне поле поза індексом (наприклад, `track_name`)
або не виключено `_id`, запит перестає бути покривним.