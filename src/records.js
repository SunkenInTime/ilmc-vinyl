// The record shelf: recordings that are free to ship, listed under "Records". The audio is in records/.
// Everything is public domain or CC0 unless `licence` says otherwise; `url` is where it came from.
// A record with no `tracks` is the one the page starts with (assets/, or the synthesised demo).
// `cut` is passed to the lathe (src/cut.js) for that record.
const commons = (file) => 'https://commons.wikimedia.org/wiki/File:' + file;

export const RECORDS = [
  { id: 'house', title: 'Demo EP', by: 'synthesised', credit: 'Synthesised by this page, with a test band' },
  {
    id: 'summer-air', title: 'Summer Air', by: 'HoliznaCC0', credit: 'HoliznaCC0', licence: 'CC0',
    url: 'https://freemusicarchive.org/music/holiznacc0/summer-air-lo-fi/',
    tracks: [
      { file: 'roof-tops.mp3', title: 'Roof Tops' },
      { file: 'summer-felt-longer-then.mp3', title: 'Summer Felt Longer Then' },
      { file: 'the-last-long-day.mp3', title: 'The Last Long Day' },
    ],
  },
  {
    id: 'rhapsody', title: 'Rhapsody in Blue (1924)', by: 'Gershwin', licence: 'public domain',
    credit: "George Gershwin, piano, with Paul Whiteman's Concert Orchestra. Victor, 10 June 1924",
    url: 'https://www.loc.gov/item/jukebox-70342/',
    tracks: [
      { file: 'rhapsody-in-blue-1.mp3', title: 'Rhapsody in Blue, side 1' },
      { file: 'rhapsody-in-blue-2.mp3', title: 'Rhapsody in Blue, side 2' },
    ],
  },
  {
    id: 'moonlight', title: 'Moonlight Sonata', by: 'Beethoven', credit: 'Paul Pitman, piano, for Musopen', licence: 'public domain',
    url: commons("Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_%27moonlight%27,_op._27_no._2_-_i._adagio_sostenuto.ogg"),
    cut: { cutPeak: 0.10 },   // 16 minutes: cut 3 dB quieter so the whole sonata fits one side
    tracks: [
      { file: 'moonlight-1.mp3', title: 'Moonlight Sonata: Adagio sostenuto' },
      { file: 'moonlight-2.mp3', title: 'Moonlight Sonata: Allegretto' },
      { file: 'moonlight-3.mp3', title: 'Moonlight Sonata: Presto agitato' },
    ],
  },
  {
    id: 'gymnopedie', title: 'Gymnopédie No. 1', by: 'Satie', credit: 'Robin Alciatore, piano, for Musopen', licence: 'public domain',
    url: commons('Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg'),
    tracks: [{ file: 'gymnopedie-1.mp3', title: 'Gymnopédie No. 1' }],
  },
  {
    id: 'nocturne', title: 'Nocturne Op. 9 No. 2', by: 'Chopin', credit: 'Frank Lévy, piano, for Musopen', licence: 'public domain',
    url: commons('Chopin_-_Nocturne_No._2_in_E-flat_major,_Op._9_No._2_(Frank_Levy).flac'),
    tracks: [{ file: 'nocturne-op9-2.mp3', title: 'Nocturne in E-flat major, Op. 9 No. 2' }],
  },
  {
    id: 'clair-de-lune', title: 'Clair de lune', by: 'Debussy', credit: 'Laurens Goedhart, piano, 2011', licence: 'public domain',
    url: commons('Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg'),
    tracks: [{ file: 'clair-de-lune.mp3', title: 'Clair de lune' }],
  },
  {
    id: 'mountain-king', title: 'Hall of the Mountain King', by: 'Grieg', credit: 'Musopen Symphony', licence: 'public domain',
    url: commons('Grieg_-_Peer_Gynt_Suite_No._1,_Op._46_-_IV._In_the_Hall_of_the_Mountain_King_(Musopen_Symphony).flac'),
    tracks: [{ file: 'mountain-king.mp3', title: 'In the Hall of the Mountain King' }],
  },
  {
    id: '1812', title: '1812 Overture', by: 'Tchaikovsky', credit: 'US Marine Band, live at Wolf Trap, 2019', licence: 'public domain',
    url: commons('1812_Overture_-_United_States_Marine_Band.opus'),
    tracks: [{ file: 'overture-1812.mp3', title: '1812 Overture' }],
  },
  {
    id: 'toccata', title: 'Toccata and Fugue', by: 'Bach', credit: 'Ashtar Moïra, organ', licence: 'public domain',
    url: commons('Toccata_et_Fugue_BWV565.ogg'),
    tracks: [{ file: 'toccata-fugue.mp3', title: 'Toccata and Fugue in D minor' }],
  },
  {
    id: 'summer-presto', title: 'Summer: Presto', by: 'Vivaldi', licence: 'CC BY-SA 4.0',
    credit: 'John Harrison, violin, with the Wichita State University Chamber Players',
    url: commons('Vivaldi_-_Four_Seasons_2_Summer_mvt_3_Presto_-_John_Harrison_violin.oga'),
    tracks: [{ file: 'summer-presto.mp3', title: 'Summer: Presto' }],
  },
];
