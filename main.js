// ---------------------------------------------
// D3.jsバブルチャート：政務活動費可視化サンプル
// 議員ごと・項目ごと・全部まとめて の切替可
// バブル同士が重ならない最大スケール自動調整
// ---------------------------------------------

const svg = d3.select("#bubbleChart");
let width = +svg.attr("width");    // SVGエリア横幅
let height = +svg.attr("height");  // SVGエリア縦幅
const colorScale = d3.scaleOrdinal(d3.schemeCategory10); // 項目ごとの色
const chartContainer = document.getElementById("chartContainer");
const minimap = d3.select("#minimap");
let minimapWidth = +minimap.attr("width");
let minimapHeight = +minimap.attr("height");

const minimapRScale = 0.6;
// グローバル変数（データ構造）
let data = [];           // data.csv読み込み後のデータ配列
let items = [];          // items.csv読み込み後の項目配列
let uniqueNames = [];    // 全議員名リスト
let uniqueItems = [];    // 全項目名リスト
let mode = "all";        // 表示モード: all/name/item
let currentMembers = []; // 現在選択中の議員
let rScale = d3.scaleSqrt(); // 金額→バブル半径

// ------- データ読み込み・初期化 -------
Promise.all([
  d3.csv("data.csv"),
  d3.csv("items.csv")
]).then(([dataCSV, itemsCSV]) => {
  // data.csvを{name, item, amount}オブジェクトの配列に変換
  data = dataCSV.map(d => ({
    name: d.name,
    item: d.item,
    amount: +d.amount // 数値化
  }));
  // items.csvは単なるラベル配列として保持
  items = itemsCSV.map(d => d[Object.keys(d)[0]]);
  uniqueNames = Array.from(new Set(data.map(d => d.name)));
  uniqueItems = Array.from(new Set(data.map(d => d.item)));

  colorScale.domain(uniqueItems);

  // 金額→バブルサイズの変換（範囲指定）
  const minA = d3.min(data, d => d.amount);
  const maxA = d3.max(data, d => d.amount);
  rScale.domain([minA, maxA]).range([12, 38]); // ここで最小/最大半径を設定

  drawLegend();
  drawMemberSelect();
  addControls();
  resizeChart();
  updateBubbles();
});

// -------- 凡例の描画 --------
// 項目ごとに色付きバブルとラベルを表示
function drawLegend() {
  const legendDiv = d3.select("#legendDiv");
  legendDiv.selectAll("span")
    .data(uniqueItems)
    .join("span")
    .style("margin-right", "18px")
    .html(item =>
      `<svg width="20" height="20" style="vertical-align:middle;">
         <circle cx="10" cy="10" r="9" fill="${colorScale(item)}" stroke="#555"/>
       </svg>
       <span style="font-size:16px;vertical-align:middle;">${item}</span>`
    );
}

// -------- 議員セレクトボックスの描画・イベント --------
function drawMemberSelect() {
  const sel = d3.select("#memberSelect");
  sel.selectAll("option")
    .data(["すべての議員", ...uniqueNames])
    .join("option")
    .attr("value", d=>d)
    .text(d=>d);
  sel.on("change", function() {
    // 選択値を取得し、currentMembersに反映
    const selected = Array.from(this.selectedOptions, o=>o.value);
    currentMembers = selected.includes("すべての議員") ? [] : selected;
    updateBubbles();
  });
}

// -------- 議員セレクト・ラベルの表示切替 --------
function toggleMemberSelect() {
  const sel = document.getElementById("memberSelect");
  const label = document.querySelector('label[for="memberSelect"]');
  if (mode === "name") {
    sel.style.display = "";
    if (label) label.style.display = "";
  } else {
    sel.style.display = "none";
    if (label) label.style.display = "none";
  }
}

// -------- スライダー表示切替 --------
// 議員ごと表示("name")ではスライダーを隠す
function toggleSlider() {
  const slider = document.getElementById("sizeSlider");
  if (mode === "name") {
    slider.style.display = "none";
  } else {
    slider.style.display = "";
  }
}

// -------- UI部品のイベント登録 --------
function addControls() {
  d3.select("#modeAll").on("click", async () => { mode="all"; await updateBubbles(); });
  d3.select("#modeName").on("click", async () => { mode="name"; await updateBubbles(); });
  d3.select("#modeItem").on("click", async () => { mode="item"; await updateBubbles(); });
  d3.select("#sizeSlider").on("input", updateBubbles);
  window.addEventListener("resize", resizeChart);
}

// -------- SVG領域のリサイズ（レスポンシブ対応） --------
function resizeChart() {
  let w = Math.min(window.innerWidth * 0.96, 900);
  let aspect = window.innerHeight / window.innerWidth;
  let h;
  // 縦長画面では高さを広げる
  if (aspect > 1.2) {
    h = Math.round(w * 1.3);
  } else {
    h = Math.round(w * 0.72);
  }
  width = w;
  height = h;
  svg.attr("width", width).attr("height", height);
  updateBubbles();
}

// -------- バブルチャート本体：モード・データごとに描画 --------
async function updateBubbles() {
  toggleMemberSelect(); // 議員セレクトの表示切替
  toggleSlider();       // スライダーの表示切替

  let showData = data;
  // 議員選択時は該当データだけに絞る
  if (mode === "name" && currentMembers.length > 0) {
    showData = data.filter(d => currentMembers.includes(d.name));
  }

  let centers;

  // ------ 全体まとめてモード ------
  if (mode === "all") {
    centers = [{x: width/2, y: height/2}];
    showData.forEach(d => { d.cx = width/2; d.cy = height/2; });

    const sliderV = +d3.select("#sizeSlider").node().value;
    let nodes = showData.map(d => ({
      ...d,
      r: rScale(d.amount) * sliderV, // スライダー値で拡大縮小
      cx: width / 2,
      cy: height / 2
    }));

    runSimulation(nodes, centers, 450);
    await drawBubblesAsync(nodes, centers, 400);
    updateMinimap(nodes);
  }
  // ------ 項目ごとモード ------
  else if (mode === "item") {
    // 項目ごとに均等配置
    centers = uniqueItems.map((item, i) => ({
      item,
      x: width*(i+1)/(uniqueItems.length+1),
      y: height/2
    }));
    showData.forEach(d => {
      const c = centers.find(c => c.item === d.item);
      d.cx = c.x; d.cy = c.y;
    });

    const sliderV = +d3.select("#sizeSlider").node().value;
    let nodes = showData.map(d => ({
      ...d,
      r: rScale(d.amount) * sliderV,
      cx: centers.find(c => c.item === d.item).x,
      cy: centers.find(c => c.item === d.item).y
    }));

    runSimulation(nodes, centers, 450);
    await drawBubblesAsync(nodes, centers, 400);
    updateMinimap(nodes);
  }
  // ------ 議員ごとモード：バブルが絶対重ならない最大スケール自動探索 ------
  else if (mode === "name") {
    const names = currentMembers.length ? currentMembers : uniqueNames;
    const n = names.length;

    // 常に4列で表示し、必要に応じて縦方向へスクロールさせる
    const cols = Math.min(4, n);
    const rows = Math.ceil(n / cols);

    const paddingX = 10, paddingY = 10;
    const cellW = (width - paddingX * 2) / cols;
    const cellH = cellW; // 正方形セル

    // 全体の高さを行数に合わせて更新し、スクロールできるようにする
    height = rows * cellH + paddingY * 2;
    svg.attr("height", height);
    centers = names.map((name, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      return {
        name,
        x: paddingX + cellW/2 + col*cellW,
        y: paddingY + cellH/2 + row*cellH
      };
    });

    // 基本半径（r0）は金額に応じて。スライダーは無視（常に最大スケールを使う）
    const sliderV = 1;
    const baseNodes = showData.map(d => ({
      ...d,
      r0: rScale(d.amount) * sliderV,
      cx: centers.find(c => c.name === d.name).x,
      cy: centers.find(c => c.name === d.name).y
    }));

    // scaleFactorを1→0.9→…と縮めつつ、クラスタ同士が重ならない最大値を探索
    let scaleFactor = 1;
    const shrinkRate = 0.9;
    const minScale = 0.1;
    let overlap = true;

    while (overlap && scaleFactor > minScale) {
      const nodes = baseNodes.map(d => ({
        ...d,
        r: d.r0 * scaleFactor
      }));
      runSimulation(nodes, centers, 200);

      // 各クラスタ（議員ごと）の外接円を計算し、ぶつかっていないか判定
      const clusters = names.map(name => {
        const clusterNodes = nodes.filter(d => d.name === name);
        const cx = d3.mean(clusterNodes, d => d.x);
        const cy = d3.mean(clusterNodes, d => d.y);
        const outer = d3.max(clusterNodes, d => Math.hypot(d.x - cx, d.y - cy) + d.r);
        return { cx, cy, r: outer };
      });

      overlap = false;
      for (let i = 0; i < clusters.length && !overlap; i++) {
        for (let j = i+1; j < clusters.length; j++) {
          const dx = clusters[i].cx - clusters[j].cx;
          const dy = clusters[i].cy - clusters[j].cy;
          const dist = Math.hypot(dx, dy);
          if (dist < clusters[i].r + clusters[j].r) {
            overlap = true;
            break;
          }
        }
      }
      if (overlap) scaleFactor *= shrinkRate; // 重なってたら縮小
    }

    // 最終的なスケールでノードを決定し描画
    const finalNodes = baseNodes.map(d => ({
      ...d,
      r: d.r0 * scaleFactor
    }));
    runSimulation(finalNodes, centers, 300);
    await drawBubblesAsync(finalNodes, centers, 400);
    updateMinimap(finalNodes);
  }
}

// -------- バブル配置のためのD3-forceシミュレーション --------
// 各ノードが重ならず指定中心(cx,cy)に集まるよう計算
function runSimulation(nodes, centers, ticks = 400) {
  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => d.cx).strength(0.95))
    .force("y", d3.forceY(d => d.cy).strength(0.95))
    .force("collide", d3.forceCollide(d => d.r).strength(1))
    .velocityDecay(0.18)
    .stop();
  for (let i = 0; i < ticks; ++i) sim.tick();
}

// -------- バブル（SVG circle）のアニメ描画 --------
function drawBubblesAsync(nodes, centers, duration = 300) {
  return new Promise(resolve => {
    let bubble = svg.selectAll("circle.bubble")
      .data(nodes, d => d.name + d.item + d.amount);

    bubble.join(
      // 新規バブル: 半径0から膨らんで表示
      enter => enter.append("circle")
        .attr("class", "bubble")
        .attr("r", 0)
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("fill", d => colorScale(d.item))
        .attr("stroke", "#555")
        .attr("stroke-width", 1.2)
        .on("mousemove", (e, d) => showTooltip(e, d))
        .on("mouseleave", hideTooltip)
        .transition().duration(duration)
        .attr("r", d => d.r),
      // 既存バブル: なめらかに位置・サイズを更新
      update => update
        .transition().duration(duration)
        .attr("r", d => d.r)
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .on("end", (_, i) => { if (i === nodes.length - 1) setTimeout(resolve, duration); }),
      // 消去バブル: 半径0に縮小し消える
      exit => exit
        .transition().duration(duration/2)
        .attr("r", 0)
        .remove()
    );

    drawLabels(centers, duration);
    setTimeout(resolve, duration + 50);
  });
}

// -------- クラスタラベルの描画・アニメーション --------
function drawLabels(centers, duration = 400) {
  if (!centers) return;
  let label = svg.selectAll("text.cluster-label")
    .data(centers, d => d.name || d.item);

  // enter: ふわっとフェードイン
  label.enter()
    .append("text")
    .attr("class", "cluster-label")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .attr("text-anchor", "middle")
    .attr("dy", "-1.3em")
    .style("font-size", "15px")
    .style("font-weight", 600)
    .style("stroke", "#fff")
    .style("stroke-width", 4)
    .style("stroke-linejoin", "round")
    .style("paint-order", "stroke")
    .style("opacity", 0)
    .text(d => d.name || d.item)
    .transition().duration(duration)
    .style("opacity", 1);

  // update: なめらかに移動・表示
  label.transition().duration(duration)
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .text(d => d.name || d.item)
    .style("opacity", 1);

  // exit: フェードアウト
  label.exit()
    .transition().duration(duration/2)
    .style("opacity", 0)
    .remove();
}

// -------- バブル詳細ツールチップ --------
function showTooltip(e, d) {
  d3.select("#tooltip")
    .style("left", (e.pageX + 15) + "px")
    .style("top", (e.pageY - 12) + "px")
    .style("display", "block")
    .html(
      `議員: ${d.name}<br>項目: ${d.item}<br>金額: ${d.amount.toLocaleString()}円`
    );
}

function hideTooltip() {
  d3.select("#tooltip").style("display", "none");
}

// -------- ミニマップ更新 --------
function updateMinimap(nodes) {
  // 議員ごと表示以外ではミニマップを非表示にする
  if (mode !== "name") {
    d3.select("#minimapWrapper").style("display", "none");
    return;
  }

  d3.select("#minimapWrapper").style("display", "");

  const scaleX = minimapWidth / width;
  const scaleY = minimapHeight / height;

  // 議員ごとにまとめて最大金額バブルの色を取得
  const grouped = d3.groups(nodes, d => d.name);
  const aggNodes = grouped.map(([name, list]) => {
    const cx = d3.mean(list, d => d.x);
    const cy = d3.mean(list, d => d.y);
    const maxN = list.reduce((a, b) => (b.amount > a.amount ? b : a));
    return {
      name,
      x: cx,
      y: cy,
      r: maxN.r,
      color: colorScale(maxN.item)
    };
  });

  let mmCircles = minimap.selectAll("circle").data(aggNodes, d => d.name);
  mmCircles.join(
    enter => enter.append("circle")
      .attr("cx", d => d.x * scaleX)
      .attr("cy", d => d.y * scaleY)
      .attr("r", d => d.r * scaleX * minimapRScale)
      .attr("fill", d => d.color)
      .attr("stroke", "#555")
      .attr("stroke-width", 0.5),
    update => update
      .attr("cx", d => d.x * scaleX)
      .attr("cy", d => d.y * scaleY)
      .attr("r", d => d.r * scaleX * minimapRScale)
      .attr("fill", d => d.color),
    exit => exit.remove()
  );

  let mmLabels = minimap.selectAll("text.mm-label").data(aggNodes, d => d.name);
  mmLabels.join(
    enter => enter.append("text")
      .attr("class", "mm-label")
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("pointer-events", "none")
      .attr("x", d => d.x * scaleX)
      .attr("y", d => d.y * scaleY + 3)
      .text(d => d.name[0]),
    update => update
      .attr("x", d => d.x * scaleX)
      .attr("y", d => d.y * scaleY + 3)
      .text(d => d.name[0]),
    exit => exit.remove()
  );

  let vp = minimap.selectAll("rect.viewport").data([0]);
  vp = vp.join("rect")
    .attr("class", "viewport")
    .attr("x", 0)
    .attr("width", minimapWidth)
    .attr("y", chartContainer.scrollTop * scaleY)
    .attr("height", chartContainer.clientHeight * scaleY);

  // ビューポート矩形をドラッグ可能にし、スクロール位置に反映
  vp.call(
    d3.drag()
      .on("drag", (event) => {
        const rectH = parseFloat(vp.attr("height"));
        let newY = event.y - rectH / 2;
        newY = Math.max(0, Math.min(minimapHeight - rectH, newY));
        vp.attr("y", newY);
        chartContainer.scrollTop = newY / scaleY;
      })
  );
}

function updateViewportRect() {
  if (mode !== "name") return;
  const scaleY = minimapHeight / height;
  minimap.select("rect.viewport")
    .attr("y", chartContainer.scrollTop * scaleY)
    .attr("height", chartContainer.clientHeight * scaleY);
}

chartContainer.addEventListener("scroll", updateViewportRect);
minimap.on("click", (event) => {
  const y = d3.pointer(event)[1];
  const scaleY = minimapHeight / height;
  chartContainer.scrollTop = y / scaleY - chartContainer.clientHeight / 2;
  updateViewportRect();
});
