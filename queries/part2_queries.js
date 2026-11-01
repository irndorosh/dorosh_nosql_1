// queries/part2_queries.js
// Запуск: mongosh "ВАШ_URI" --file queries/part2_queries.js

db = db.getSiblingDB("spotify");

// Завдання 1. Треки для вечірки
// danceability > 0.7, energy > 0.7, тривалість 3–5 хв (180000–300000 мс)
const partyFilter = {
  "audio_features.danceability": { $gt: 0.7 },
  "audio_features.energy": { $gt: 0.7 },
  duration_ms: { $gte: 180000, $lte: 300000 }
};

const partyTracks = db.tracks
  .find(partyFilter, {
    _id: 0,
    track_name: 1,
    artists: 1,
    track_genre: 1,
    popularity: 1,
    duration_sec: 1,
    "audio_features.danceability": 1,
    "audio_features.energy": 1
  })
  .sort({ popularity: -1, track_name: 1, track_genre: 1 })
  .limit(10)
  .toArray();

print("\nЗавдання 1. Треки для вечірки");
print("Знайдено треків: " + db.tracks.countDocuments(partyFilter));
print("Топ-10 за популярністю:");
printjson(partyTracks);

// Завдання 2. Виконавці, у яких усі треки популярні
// мінімум 3 треки, мінімальна популярність >= 60
const popularArtists = db.tracks.aggregate([
  { $unwind: "$artists" },
  // Один і той самий трек може зустрічатися в кількох жанрах —
  // спершу зводимо до унікальних пар (артист, track_id).
  // У дублікатів popularity іноді відрізняється — беремо мінімальну, щоб перевірка була суворою
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
]).toArray();

print("\nЗавдання 2. Топ-20 артистів, у яких усі треки популярні");
printjson(popularArtists);

// Завдання 3. Нетипові треки
// tempo треку > mean жанру + 2 * stdDev жанру
const tempoOutliers = db.tracks.aggregate([
  // Рахуємо середнє та стандартне відхилення tempo по жанру,
  // не втрачаючи самих треків
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
]).toArray();

print("\nЗавдання 3. Нетипові треки за темпом");
print("Жанрів із нетиповими треками: " + tempoOutliers.length);
print(
  "Усього нетипових треків: " +
    tempoOutliers.reduce((sum, g) => sum + g.outlier_tracks.length, 0)
);
print("Перші 3 жанри (по 3 треки з найвищим темпом):");
printjson(
  tempoOutliers
    .slice(0, 3)
    .map((g) => ({ ...g, outlier_tracks: g.outlier_tracks.slice(0, 3) }))
);

// Завдання 4. Треки для фонової роботи
// loudness < -10, speechiness < 0.1, instrumentalness > 0.5, не explicit
const workFilter = {
  "audio_features.loudness": { $lt: -10 },
  "audio_features.speechiness": { $lt: 0.1 },
  "audio_features.instrumentalness": { $gt: 0.5 },
  explicit: false
};

const workTracks = db.tracks
  .find(workFilter, {
    _id: 0,
    track_name: 1,
    artists: 1,
    track_genre: 1,
    popularity: 1,
    explicit: 1,
    "audio_features.loudness": 1,
    "audio_features.speechiness": 1,
    "audio_features.instrumentalness": 1
  })
  .sort({ popularity: -1, track_name: 1, track_genre: 1 })
  .limit(10)
  .toArray();

print("\nЗавдання 4. Треки для фонової роботи");
print("Знайдено треків: " + db.tracks.countDocuments(workFilter));
print("Топ-10 за популярністю:");
printjson(workTracks);