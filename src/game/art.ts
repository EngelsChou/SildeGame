import Phaser from "phaser";

// Original procedural development art. Final four-direction frame sets are tracked separately.
export function createArt(scene: Phaser.Scene) {
  const texture = (
    name: string,
    w: number,
    h: number,
    draw: (c: CanvasRenderingContext2D) => void,
  ) => {
    if (scene.textures.exists(name)) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d")!);
    scene.textures.addCanvas(name, canvas);
  };
  const ellipse = (
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: string,
  ) => {
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  };
  const poly = (
    c: CanvasRenderingContext2D,
    points: number[][],
    color: string,
  ) => {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  };
  for (const facing of ["down", "up", "left", "right"])
    for (const armed of [true, false])
      texture(`hero-${armed ? "" : "swing-"}${facing}`, 96, 112, (c) => {
        ellipse(c, 48, 98, 25, 9, "#254c393a");
        if (facing === "left") {
          c.translate(96, 0);
          c.scale(-1, 1);
        }
        poly(
          c,
          [
            [30, 52],
            [64, 52],
            [73, 89],
            [46, 82],
            [25, 89],
          ],
          "#e68b48",
        );
        c.fillStyle = "#254754";
        c.fillRect(34, 78, 10, 17);
        c.fillRect(53, 78, 10, 17);
        ellipse(c, 37, 95, 10, 5, "#203d46");
        ellipse(c, 60, 95, 10, 5, "#203d46");
        c.fillStyle = "#3e7183";
        c.beginPath();
        c.roundRect(28, 49, 39, 32, 10);
        c.fill();
        c.fillStyle = "#afc4bc";
        c.fillRect(33, 52, 9, 25);
        c.fillRect(53, 52, 9, 25);
        c.fillStyle = "#805840";
        c.fillRect(29, 70, 38, 7);
        c.fillStyle = "#efca72";
        c.fillRect(43, 69, 10, 10);
        ellipse(c, 24, 64, 7, 10, "#edbd89");
        ellipse(c, 71, 65, 7, 10, "#edbd89");
        if (armed) {
          poly(
            c,
            [
              [71, 73],
              [79, 26],
              [84, 15],
              [88, 29],
              [79, 77],
            ],
            "#eef4dd",
          );
          poly(
            c,
            [
              [79, 26],
              [84, 15],
              [83, 73],
              [79, 77],
            ],
            "#aec6bd",
          );
          poly(
            c,
            [
              [66, 71],
              [84, 76],
              [82, 82],
              [64, 77],
            ],
            "#e4ba5b",
          );
        }
        ellipse(c, 47, 36, 22, 23, "#edbd89");
        poly(
          c,
          [
            [25, 36],
            [25, 17],
            [43, 8],
            [63, 14],
            [69, 28],
            [61, 37],
            [58, 26],
            [42, 29],
            [35, 23],
            [34, 37],
          ],
          "#3a4546",
        );
        if (facing !== "up") {
          ellipse(c, 41, 37, 2.3, 3, "#263b39");
          ellipse(c, 56, 37, 2.3, 3, "#263b39");
          c.strokeStyle = "#bb7858";
          c.lineWidth = 2;
          c.beginPath();
          c.arc(48, 42, 5, 0, Math.PI);
          c.stroke();
        } else ellipse(c, 47, 33, 22, 22, "#3a4546");
        poly(
          c,
          [
            [27, 48],
            [52, 52],
            [65, 47],
            [62, 58],
            [41, 59],
          ],
          "#f6df9e",
        );
        poly(
          c,
          [
            [35, 13],
            [29, 3],
            [42, 8],
            [46, 15],
          ],
          "#e9bc65",
        );
      });
  texture("chaser", 96, 96, (c) => {
    ellipse(c, 48, 80, 32, 10, "#24473938");
    ellipse(c, 48, 53, 34, 28, "#4e8867");
    ellipse(c, 44, 45, 30, 27, "#74a967");
    ellipse(c, 40, 40, 19, 17, "#8fbc70");
    poly(
      c,
      [
        [22, 29],
        [10, 8],
        [36, 21],
      ],
      "#4c966b",
    );
    poly(
      c,
      [
        [61, 23],
        [82, 8],
        [77, 37],
      ],
      "#4c966b",
    );
    ellipse(c, 29, 75, 10, 9, "#3b6b53");
    ellipse(c, 66, 75, 10, 9, "#3b6b53");
    ellipse(c, 35, 47, 4, 5, "#183f3c");
    ellipse(c, 59, 47, 4, 5, "#183f3c");
    ellipse(c, 47, 58, 7, 5, "#edd999");
    ellipse(c, 29, 29, 5, 5, "#d2d88a");
  });
  texture("runner", 96, 96, (c) => {
    ellipse(c, 48, 80, 30, 8, "#24473938");
    poly(
      c,
      [
        [70, 53],
        [91, 41],
        [88, 66],
        [67, 76],
      ],
      "#cad5c0",
    );
    ellipse(c, 46, 59, 29, 23, "#dce3c9");
    poly(
      c,
      [
        [21, 44],
        [17, 12],
        [40, 34],
        [55, 32],
        [75, 12],
        [73, 53],
      ],
      "#eff0d8",
    );
    poly(
      c,
      [
        [22, 31],
        [22, 20],
        [33, 34],
      ],
      "#a6b6a6",
    );
    poly(
      c,
      [
        [61, 34],
        [70, 20],
        [68, 40],
      ],
      "#a6b6a6",
    );
    ellipse(c, 46, 51, 25, 20, "#f2f1db");
    poly(
      c,
      [
        [36, 54],
        [48, 63],
        [59, 52],
      ],
      "#6f9895",
    );
    ellipse(c, 34, 45, 3, 4, "#344f56");
    ellipse(c, 60, 45, 3, 4, "#344f56");
    ellipse(c, 29, 77, 9, 5, "#8ea69a");
    ellipse(c, 66, 77, 9, 5, "#8ea69a");
  });
  texture("ranger", 96, 112, (c) => {
    ellipse(c, 48, 96, 23, 7, "#24473932");
    ellipse(c, 25, 50, 18, 25, "#e2d7f39a");
    ellipse(c, 72, 47, 18, 25, "#e2d7f39a");
    poly(
      c,
      [
        [48, 12],
        [71, 43],
        [60, 77],
        [48, 87],
        [33, 69],
        [27, 42],
      ],
      "#997fc2",
    );
    poly(
      c,
      [
        [48, 12],
        [49, 74],
        [27, 42],
      ],
      "#c2ade4",
    );
    poly(
      c,
      [
        [48, 12],
        [71, 43],
        [49, 74],
      ],
      "#aa95d2",
    );
    ellipse(c, 39, 47, 3, 4, "#fff5d8");
    ellipse(c, 57, 47, 3, 4, "#fff5d8");
    poly(
      c,
      [
        [48, 77],
        [54, 93],
        [48, 89],
        [41, 98],
      ],
      "#eadca9",
    );
  });
  texture("boss", 192, 192, (c) => {
    ellipse(c, 96, 169, 67, 17, "#25493845");
    poly(
      c,
      [
        [42, 120],
        [54, 173],
        [80, 173],
        [82, 129],
      ],
      "#627c78",
    );
    poly(
      c,
      [
        [111, 127],
        [111, 174],
        [141, 171],
        [151, 119],
      ],
      "#627c78",
    );
    ellipse(c, 96, 101, 60, 55, "#819791");
    poly(
      c,
      [
        [42, 79],
        [20, 91],
        [13, 130],
        [34, 145],
        [54, 126],
      ],
      "#94a99c",
    );
    poly(
      c,
      [
        [147, 78],
        [173, 91],
        [178, 131],
        [154, 145],
        [137, 118],
      ],
      "#94a99c",
    );
    poly(
      c,
      [
        [61, 70],
        [56, 110],
        [92, 129],
        [135, 110],
        [130, 70],
      ],
      "#bec8b0",
    );
    poly(
      c,
      [
        [73, 90],
        [96, 77],
        [120, 90],
        [96, 116],
      ],
      "#669da1",
    );
    poly(
      c,
      [
        [58, 47],
        [38, 11],
        [61, 24],
        [75, 53],
      ],
      "#e4c37c",
    );
    poly(
      c,
      [
        [120, 52],
        [133, 21],
        [157, 8],
        [140, 54],
      ],
      "#e4c37c",
    );
    c.fillStyle = "#8b9f94";
    c.beginPath();
    c.roundRect(53, 38, 86, 46, 14);
    c.fill();
    c.fillStyle = "#304f4a";
    c.fillRect(67, 57, 21, 8);
    c.fillRect(106, 57, 21, 8);
    c.fillStyle = "#9ce6bd";
    c.fillRect(73, 58, 13, 5);
    c.fillRect(108, 58, 13, 5);
    poly(
      c,
      [
        [87, 70],
        [96, 82],
        [105, 70],
      ],
      "#d4ddbd",
    );
  });
  texture("tree", 160, 208, (c) => {
    ellipse(c, 81, 184, 49, 14, "#32523c30");
    poly(
      c,
      [
        [70, 119],
        [64, 184],
        [53, 190],
        [81, 185],
        [104, 191],
        [95, 178],
        [90, 113],
      ],
      "#8a6a45",
    );
    poly(
      c,
      [
        [79, 143],
        [81, 184],
        [94, 185],
        [88, 121],
      ],
      "#6b593d",
    );
    ellipse(c, 82, 111, 67, 51, "#477b59");
    ellipse(c, 55, 87, 49, 42, "#619761");
    ellipse(c, 102, 80, 47, 43, "#6ca168");
    ellipse(c, 81, 48, 42, 40, "#7fae70");
    ellipse(c, 65, 37, 23, 16, "#9fc17c");
    ellipse(c, 35, 91, 17, 10, "#8db976");
  });
  texture("rock", 100, 96, (c) => {
    ellipse(c, 49, 77, 39, 10, "#32523c30");
    poly(
      c,
      [
        [10, 67],
        [23, 28],
        [58, 16],
        [87, 41],
        [92, 73],
        [48, 85],
      ],
      "#8eaaa0",
    );
    poly(
      c,
      [
        [23, 28],
        [58, 16],
        [68, 39],
        [32, 49],
      ],
      "#c0c9b3",
    );
    poly(
      c,
      [
        [68, 39],
        [87, 41],
        [92, 73],
        [53, 77],
      ],
      "#718f89",
    );
  });
  for (let q = 0; q < 3; q++)
    texture(`gear-${q}`, 52, 60, (c) => {
      const color = ["#e2e6c8", "#82bde0", "#f0ce72"][q];
      ellipse(c, 26, 53, 19, 6, "#294a383b");
      poly(
        c,
        [
          [14, 15],
          [38, 15],
          [44, 45],
          [26, 52],
          [8, 44],
        ],
        color,
      );
      poly(
        c,
        [
          [17, 16],
          [19, 7],
          [34, 7],
          [36, 16],
        ],
        "#6e5c43",
      );
      c.fillStyle = "#fff2cb";
      c.fillRect(21, 26, 10, 12);
    });
  texture("book", 52, 60, (c) => {
    ellipse(c, 26, 53, 19, 6, "#294a383b");
    poly(
      c,
      [
        [10, 12],
        [35, 7],
        [42, 45],
        [16, 52],
      ],
      "#5d6b9c",
    );
    poly(
      c,
      [
        [15, 12],
        [35, 9],
        [38, 44],
        [18, 48],
      ],
      "#9bade0",
    );
    poly(
      c,
      [
        [22, 22],
        [31, 21],
        [33, 32],
        [25, 36],
      ],
      "#f7e2a6",
    );
  });
  texture("heal", 44, 48, (c) => {
    ellipse(c, 22, 40, 15, 5, "#294a383b");
    c.fillStyle = "#ef8570";
    c.beginPath();
    c.moveTo(22, 37);
    c.bezierCurveTo(0, 21, 5, 9, 15, 13);
    c.bezierCurveTo(21, 14, 22, 19, 22, 19);
    c.bezierCurveTo(29, 5, 49, 14, 22, 37);
    c.fill();
    ellipse(c, 15, 19, 4, 3, "#ffc5a0");
  });
}
