const svg = d3.select("#bubbleChart");
let width = +svg.attr("width");
let height = +svg.attr("height");
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

let data = [];
let items = [];
let uniqueNames = [];
let uniqueItems = [];
let mode = "all";
let currentMembers = [];
let rScale = d3.scaleSqrt();

Promise.all([
  d3.csv("data.csv"),
  d3.csv("items.csv")
]).then(([dataCSV, itemsCSV]) => {
  data = dataCSV.map(d => ({
    name: d.name,
    item: d.item,
    amount: +d.amount
  }));
  items = itemsCSV.map(d => d[Object.keys(d)[0]]);
  uniqueNames = Array.from(new Set(data.map(d => d.name)));
  uniqueItems = Array.from(new Set(data.map(d => d.item)));

  colorScale.domain(uniqueItems);

  const minA = d3.min(data, d => d.amount);
  const maxA = d3.max(data, d => d.amount);
  rScale.domain([minA, maxA]).range([12, 38]);

  drawLegend();
  drawMemberSelect();
  addControls();
  resizeChart();
  updateBubbles();
});

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

function drawMemberSelect() {
  const sel = d3.select("#memberSelect");
  sel.selectAll("option")
    .data(["すべての議員", ...uniqueNames])
    .join("option")
    .attr("value", d=>d)
    .text(d=>d);
  sel.on("change", function() {
    const selected = Array.from(this.selectedOptions, o=>o.value);
    currentMembers = selected.includes("すべての議員") ? [] : selected;
    updateBubbles();
  });
}

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

function addControls() {
  d3.select("#modeAll").on("click", async () => { mode="all"; await updateBubbles(); });
  d3.select("#modeName").on("click", async () => { mode="name"; await updateBubbles(); });
  d3.select("#modeItem").on("click", async () => { mode="item"; await updateBubbles(); });
  d3.select("#sizeSlider").on("input", updateBubbles);
  window.addEventListener("resize", resizeChart);
}

function resizeChart() {
  let w = Math.min(window.innerWidth * 0.96, 900);
  let aspect = window.innerHeight / window.innerWidth;
  let h;
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

async function updateBubbles() {
  toggleMemberSelect();

  let showData = data;
  if (mode === "name" && currentMembers.length > 0) {
    showData = data.filter(d => currentMembers.includes(d.name));
  }

  let centers;

  if (mode === "all") {
    centers = [{x: width/2, y: height/2}];
    showData.forEach(d => { d.cx = width/2; d.cy = height/2; });

    const sliderV = +d3.select("#sizeSlider").node().value;
    let nodes = showData.map(d => ({
      ...d,
      r: rScale(d.amount) * sliderV,
      cx: width / 2,
      cy: height / 2
    }));

    runSimulation(nodes, centers, 450);
    await drawBubblesAsync(nodes, centers, 400);
  }
  else if (mode === "item") {
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
  }
  // ── 修正ブロック開始: 議員別表示の全体スケール調整方式 ──
  else if (mode === "name") {
    // 対象の議員リスト
    const names = currentMembers.length ? currentMembers : uniqueNames;
    const n = names.length;

    // グリッド配置計算（既存ロジック）
    let isMobile = window.innerWidth < 700;
    let aspect = window.innerHeight / window.innerWidth;
    let cols;
    if (isMobile) {
      cols = Math.min(4, n);
    } else {
      cols = aspect > 1.2
        ? Math.ceil(Math.sqrt(n * 0.7))
        : Math.ceil(Math.sqrt(n));
      cols = Math.max(1, cols);
    }
    const rows = Math.ceil(n / cols);
    const paddingX = 10, paddingY = 10;
    const cellW = (width - paddingX * 2) / cols;
    const cellH = (height - paddingY * 2) / rows;
    centers = names.map((name, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      return {
        name,
        x: paddingX + cellW/2 + col*cellW,
        y: paddingY + cellH/2 + row*cellH
      };
    });

    // 基本半径を保持
    const sliderV = +d3.select("#sizeSlider").node().value;
    const baseNodes = showData.map(d => ({
      ...d,
      r0: rScale(d.amount) * sliderV,
      cx: centers.find(c => c.name === d.name).x,
      cy: centers.find(c => c.name === d.name).y
    }));

    // 全体スケール探索
    let scaleFactor = 1;
    const shrinkRate = 0.9;
    const minScale = 0.1;
    let overlap = true;

    while (overlap && scaleFactor > minScale) {
      // スケール適用
      const nodes = baseNodes.map(d => ({
        ...d,
        r: d.r0 * scaleFactor
      }));
      runSimulation(nodes, centers, 200);

      // クラスタごとに外接円を算出し重なり判定
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

      if (overlap) scaleFactor *= shrinkRate;
    }

    // 最終描画
    const finalNodes = baseNodes.map(d => ({
      ...d,
      r: d.r0 * scaleFactor
    }));
    runSimulation(finalNodes, centers, 300);
    await drawBubblesAsync(finalNodes, centers, 400);
  }
  // ── 修正ブロック終了 ──
}

// Force シミュレーション（位置計算のみ）
function runSimulation(nodes, centers, ticks = 400) {
  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => d.cx).strength(0.95))
    .force("y", d3.forceY(d => d.cy).strength(0.95))
    .force("collide", d3.forceCollide(d => d.r).strength(1))
    .velocityDecay(0.18)
    .stop();
  for (let i = 0; i < ticks; ++i) sim.tick();
}

// アニメーション描画
function drawBubblesAsync(nodes, centers, duration = 300) {
  return new Promise(resolve => {
    let bubble = svg.selectAll("circle.bubble")
      .data(nodes, d => d.name + d.item + d.amount);

    bubble.join(
      enter => enter.append("circle")
        .attr("class", "bubble")
        .attr("r", d => d.r)
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("fill", d => colorScale(d.item))
        .attr("stroke", "#555")
        .attr("stroke-width", 1.2)
        .on("mousemove", (e, d) => showTooltip(e, d))
        .on("mouseleave", hideTooltip),
      update => update
        .transition().duration(duration)
        .attr("r", d => d.r)
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .on("end", (_, i) => { if (i === nodes.length - 1) setTimeout(resolve, duration); })
    );
    bubble.exit().remove();

    drawLabels(centers);
    setTimeout(resolve, duration + 50);
  });
}

function drawLabels(centers) {
  svg.selectAll("text.cluster-label").remove();
  if (!centers) return;
  if (centers[0].name) {
    svg.selectAll("text.cluster-label")
      .data(centers)
      .enter()
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
      .text(d => d.name)
      .clone(true)
      .style("stroke", "none")
      .style("fill", "#333")
      .text(d => d.name);
  } else {
    svg.selectAll("text.cluster-label")
      .data(centers)
      .enter()
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
      .text(d => d.item)
      .clone(true)
      .style("stroke", "none")
      .style("fill", "#333")
      .text(d => d.item);
  }
}

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
