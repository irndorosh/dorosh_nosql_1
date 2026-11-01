// queries/part3_indexes.js
// Запуск: mongosh "ВАШ_URI" --file queries/part3_indexes.js

db = db.getSiblingDB("spotify");

// Для ідемпотентного повторного запуску — прибираємо всі індекси, крім _id
db.tracks.dropIndexes();

// Коротке зведення по explain("executionStats"):
// які стадії у плані, який індекс обрано, скільки ключів/документів переглянуто
function stagesOf(plan) {
  const stages = [];
  let node = plan;
  while (node) {
    stages.push(node.indexName ? `${node.stage}(${node.indexName})` : node.stage);
    node = node.inputStage || (node.inputStages && node.inputStages[0]);
  }
  return stages.join(" <- ");
}

function summarize(title, explain) {
  const stats = explain.executionStats;
  print(`\n${title}`);
  printjson({
    winningPlan: stagesOf(explain.queryPlanner.winningPlan.queryPlan || explain.queryPlanner.winningPlan),
    rejectedPlans: explain.queryPlanner.rejectedPlans.length,
    nReturned: stats.nReturned,
    totalKeysExamined: stats.totalKeysExamined,
    totalDocsExamined: stats.totalDocsExamined,
    executionTimeMillis: stats.executionTimeMillis
  });
}

// Завдання 1. Аналіз запиту та індексація
print("\nЗавдання 1. pop + danceability >= 0.7, sort by popularity");

const popFilter = {
  track_genre: "pop",
  "audio_features.danceability": { $gte: 0.7 }
};

// Крок 1. План виконання без індексів
const before = db.tracks.find(popFilter).sort({ popularity: -1 }).explain("executionStats");
summarize("До створення індексу", before);

// Крок 2. Складений індекс за правилом ESR (Equality → Sort → Range):
//   track_genre                  — точний збіг (Equality)
//   popularity                   — сортування (Sort), напрям як у запиті
//   audio_features.danceability  — діапазон (Range)
// Такий порядок дає змогу віддавати документи вже відсортованими (без SORT у пам'яті),
// а умову за danceability перевіряти прямо за ключами індексу, до FETCH документа.
db.tracks.createIndex(
  { track_genre: 1, popularity: -1, "audio_features.danceability": 1 },
  { name: "genre_popularity_danceability" }
);

// Крок 3. План виконання після створення індексу
const after = db.tracks.find(popFilter).sort({ popularity: -1 }).explain("executionStats");
summarize("Після створення індексу", after);

// Сам запит — переконуємось, що результат той самий
const popTracks = db.tracks.find(popFilter).sort({ popularity: -1 }).toArray();
print(`Знайдено треків: ${popTracks.length}`);

// Завдання 2. Індекс для пошуку музики для роботи
print("\nЗавдання 2. instrumentalness + speechiness + explicit");

const workFilter = {
  explicit: false,
  "audio_features.instrumentalness": { $gt: 0.5 },
  "audio_features.speechiness": { $lt: 0.1 }
};

summarize("До створення індексу", db.tracks.find(workFilter).explain("executionStats"));

// explicit — умова на рівність, тому стоїть першим (ESR);
// далі два діапазонні поля. instrumentalness > 0.5 — значно селективніша умова
// (~17% треків), ніж speechiness < 0.1 (~80%), тому вона йде раніше.
db.tracks.createIndex(
  {
    explicit: 1,
    "audio_features.instrumentalness": 1,
    "audio_features.speechiness": 1
  },
  { name: "explicit_instrumentalness_speechiness" }
);

summarize("Після створення індексу", db.tracks.find(workFilter).explain("executionStats"));

// Повний запит із Частини 2 (Завдання 4) — loudness не входить в індекс,
// тому перевіряється на стадії FETCH, але відбір усе одно йде через індекс
summarize(
  "Запит із Частини 2, Завдання 4 (+ loudness < -10)",
  db.tracks
    .find({ ...workFilter, "audio_features.loudness": { $lt: -10 } })
    .explain("executionStats")
);

// Завдання 3. Покривний запит (факультативне)
print("\nЗавдання 3. Covered query");

const coveredFilter = { track_genre: "pop", popularity: { $gte: 70 } };

// Як у завданні — без проєкції: потрібні цілі документи, тож є FETCH
summarize("Без проєкції", db.tracks.find(coveredFilter).explain("executionStats"));

// З проєкцією лише на поля індексу і без _id — запит стає покривним:
// PROJECTION_COVERED, totalDocsExamined = 0
summarize(
  "З проєкцією { _id: 0, track_genre: 1, popularity: 1 }",
  db.tracks
    .find(coveredFilter, { _id: 0, track_genre: 1, popularity: 1 })
    .explain("executionStats")
);

print("\nІндекси колекції tracks:");
printjson(db.tracks.getIndexes());