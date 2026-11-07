/** Interior points in the supplied 662 × 1176 achievement artwork, in Quran order. */
export const HEART_SURAH_POINTS: readonly (readonly [number, number])[] = [
  [190,250], [332,210], [213,286], [326,266], [394,268], [470,267],
  [308,316], [364,320], [119,413], [161,365], [217,340], [269,381],
  [327,357], [397,360], [447,389], [297,407], [356,394], [420,411],
  [365,434], [315,444], [399,457], [461,441], [466,473], [514,425],
  [520,456], [572,429], [64,491], [102,463], [154,442], [221,420],
  [261,440], [348,473], [421,502], [546,488], [559,520], [598,486],
  [246,491], [201,483], [290,493], [367,526], [459,554], [493,512],
  [531,560], [73,533], [44,564], [146,506], [246,535], [321,556],
  [380,580], [472,601], [543,607], [29,623], [87,587], [144,566],
  [199,560], [276,590], [418,624], [482,637], [535,669], [102,656],
  [44,695], [171,627], [249,645], [319,625], [374,648], [434,780],
  [512,707], [55,750], [111,712], [171,688], [239,685], [298,697],
  [360,729], [470,742], [410,719], [80,792], [126,823], [192,749],
  [241,744], [292,746], [340,765], [400,772], [454,690], [519,780],
  [134,765], [196,803], [200,846], [140,861], [250,794], [260,850],
  [380,788], [435,804], [494,829], [156,902], [238,876], [316,818],
  [360,845], [466,896], [422,851], [201,935], [255,914], [340,890],
  [395,910], [326,938], [383,960], [451,953], [234,967], [300,1001],
  [350,1015], [426,1002], [239,1030], [285,1022], [323,1036], [380,1055],
];

/** Finds an enclosed paper cell without crossing the original ink or colouring the page background. */
export function heartCellPixels(rgba: Uint8ClampedArray, width: number, height: number, point: readonly [number, number]): number[] {
  const start = point[1] * width + point[0];
  const isPaper = (index: number) => {
    const offset = index * 4;
    return rgba[offset] > 200 && rgba[offset + 1] > 200 && rgba[offset + 2] > 200;
  };
  if (!isPaper(start)) return [];
  const visited = new Uint8Array(width * height);
  const stack = [start];
  const pixels: number[] = [];
  visited[start] = 1;
  while (stack.length) {
    const index = stack.pop()!;
    const x = index % width, y = Math.floor(index / width);
    // A gap in the photographed outline must never tint the surrounding artwork.
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || pixels.length > 20000) return [];
    pixels.push(index);
    for (const next of [index - 1, index + 1, index - width, index + width]) {
      if (!visited[next] && isPaper(next)) { visited[next] = 1; stack.push(next); }
    }
  }
  return pixels;
}
