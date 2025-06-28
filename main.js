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

  // rScaleは「半径」！
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
	  `<svg width="20" height="20" style="vertical-align:middle;"><circle cx="10" cy="10" r="9" fill="${colorScale(item)}" stroke="#555"/></svg>
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

function addControls() {
  d3.select("#modeAll").on("click", () => { mode="all"; updateBubbles(); });
  d3.select("#modeName").on("click", () => { mode="name"; updateBubbles(); });
  d3.select("#modeItem").on("click", () => { mode="item"; updateBubbles(); });
  d3.select("#sizeSlider").on("input", updateBubbles);
  window.addEventListener("resize", resizeChart);
}

function resizeChart() {
  const parentW = Math.min(window.innerWidth * 0.96, 900);
  width = parentW;
  height = Math.round(parentW * 0.72);
  svg.attr("width", width).attr("height", height);
  updateBubbles();
}

async function updateBubbles() {
  let showData = data;
  if (mode === "name" && currentMembers.length > 0)
	showData = data.filter(d => currentMembers.includes(d.name));

  let centers;

  if (mode === "all") {
	centers = [{x: width/2, y: height/2}];
	showData.forEach(d => { d.cx=width/2; d.cy=height/2; });

	const sliderV = +d3.select("#sizeSlider").node().value;
	let nodes = showData.map(d => ({
	  ...d,
	  r: rScale(d.amount) * sliderV,
	  cx: width / 2,
	  cy: height / 2
	}));

	runSimulation(nodes, centers, 450);
	drawBubbles(nodes, centers);

  } else if (mode === "item") {
	centers = uniqueItems.map((item, i) => ({
	  item, x: width*(i+1)/(uniqueItems.length+1), y: height/2
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
	drawBubbles(nodes, centers);

  } else if (mode === "name") {
	// -------- 議員別モード：最大化配置＋接触するなら最小まで縮小 --------
	const names = currentMembers.length ? currentMembers : uniqueNames;
	const n = names.length;
	const cols = Math.ceil(Math.sqrt(n));
	const rows = Math.ceil(n / cols);

	const paddingX = 10, paddingY = 10;
	const cellW = (width - paddingX * 2) / cols;
	const cellH = (height - paddingY * 2) / rows;

	centers = names.map((name, idx) => {
	  const row = Math.floor(idx / cols);
	  const col = idx % cols;
	  return {
		name,
		x: paddingX + cellW / 2 + col * cellW,
		y: paddingY + cellH / 2 + row * cellH,
		row, col
	  };
	});

	let minR = 8;
	let tryR = Math.min(cellW, cellH) * 0.23;
	let shrinkRate = 0.92;
	let overlap = true;
	let nodes = [];
	let finalR = tryR;
	let lastNodes = null;

	// できるだけ大きい半径で重ならない値を探す
	while (overlap && tryR > minR) {
	  nodes = showData.map(d => ({
		...d,
		r: tryR,
		cx: centers.find(c => c.name === d.name).x,
		cy: centers.find(c => c.name === d.name).y
	  }));

	  runSimulation(nodes, centers, 200);

	  // クラスタごと外接円を計算
	  let clusters = names.map(name => {
		let clusterNodes = nodes.filter(d => d.name === name);
		if (clusterNodes.length === 0) return null;
		let center = {
		  x: d3.mean(clusterNodes, d => d.x),
		  y: d3.mean(clusterNodes, d => d.y)
		};
		let outer = d3.max(clusterNodes, d => Math.hypot(d.x - center.x, d.y - center.y) + d.r);
		return {center, radius: outer};
	  }).filter(Boolean);

	  // クラスタ間で外接円が重なっていないか判定
	  overlap = false;
	  for (let i = 0; i < clusters.length; ++i) {
		for (let j = i+1; j < clusters.length; ++j) {
		  let dx = clusters[i].center.x - clusters[j].center.x;
		  let dy = clusters[i].center.y - clusters[j].center.y;
		  let dist = Math.hypot(dx, dy);
		  if (dist < clusters[i].radius + clusters[j].radius) {
			overlap = true;
			break;
		  }
		}
		if (overlap) break;
	  }

	  await drawBubblesAsync(nodes, centers, 180);

	  if (overlap) {
		tryR *= shrinkRate;
		lastNodes = nodes;
	  } else {
		finalR = tryR;
	  }
	}

	// ★ もし「minR」まで縮めても接触してしまう場合は、さらに小さくして絶対ぶつからない値を探す
	if (overlap && tryR <= minR) {
	  let subMinR = minR;
	  let trySubR = minR;
	  let subOverlap = true;
	  while (subOverlap && trySubR > 1) {
		nodes = showData.map(d => ({
		  ...d,
		  r: trySubR,
		  cx: centers.find(c => c.name === d.name).x,
		  cy: centers.find(c => c.name === d.name).y
		}));

		runSimulation(nodes, centers, 100);

		let clusters = names.map(name => {
		  let clusterNodes = nodes.filter(d => d.name === name);
		  if (clusterNodes.length === 0) return null;
		  let center = {
			x: d3.mean(clusterNodes, d => d.x),
			y: d3.mean(clusterNodes, d => d.y)
		  };
		  let outer = d3.max(clusterNodes, d => Math.hypot(d.x - center.x, d.y - center.y) + d.r);
		  return {center, radius: outer};
		}).filter(Boolean);

		subOverlap = false;
		for (let i = 0; i < clusters.length; ++i) {
		  for (let j = i+1; j < clusters.length; ++j) {
			let dx = clusters[i].center.x - clusters[j].center.x;
			let dy = clusters[i].center.y - clusters[j].center.y;
			let dist = Math.hypot(dx, dy);
			if (dist < clusters[i].radius + clusters[j].radius) {
			  subOverlap = true;
			  break;
			}
		  }
		  if (subOverlap) break;
		}
		if (!subOverlap) {
		  finalR = trySubR;
		  break;
		}
		trySubR *= 0.9;
	  }
	}

	if (lastNodes) {
	  await drawBubblesAsync(lastNodes, centers, 180);
	}
	nodes = showData.map(d => ({
	  ...d,
	  r: finalR,
	  cx: centers.find(c => c.name === d.name).x,
	  cy: centers.find(c => c.name === d.name).y
	}));

	runSimulation(nodes, centers, 300);
	drawBubbles(nodes, centers);
  }
}

// Forceシミュレーション（位置計算のみ）
function runSimulation(nodes, centers, ticks = 400) {
  const sim = d3.forceSimulation(nodes)
	.force("x", d3.forceX(d => d.cx).strength(0.95))
	.force("y", d3.forceY(d => d.cy).strength(0.95))
	.force("collide", d3.forceCollide(d => d.r).strength(1))
	.velocityDecay(0.18)
	.stop();
  for (let i = 0; i < ticks; ++i) sim.tick();
}

// 描画（アニメーションなし）
function drawBubbles(nodes, centers) {
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
	  .on("mousemove", function (e, d) { showTooltip(e, d); })
	  .on("mouseleave", hideTooltip),
	update => update
	  .transition().duration(300)
	  .attr("r", d => d.r)
	  .attr("cx", d => d.x)
	  .attr("cy", d => d.y)
	  .attr("fill", d => colorScale(d.item))
  );
  bubble.exit().remove();

  // クラスタラベル描画
  drawLabels(centers);
}

// 描画（アニメーションつき、await可）
function drawBubblesAsync(nodes, centers, duration=180) {
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
		.on("mousemove", function (e, d) { showTooltip(e, d); })
		.on("mouseleave", hideTooltip),
	  update => update
		.transition().duration(duration)
		.attr("r", d => d.r)
		.attr("cx", d => d.x)
		.attr("cy", d => d.y)
		.attr("fill", d => colorScale(d.item))
		.on("end", (_,i,nodesArr) => {
		  if (i === nodes.length - 1) setTimeout(resolve, duration);
		})
	);
	bubble.exit().remove();

	drawLabels(centers);

	setTimeout(resolve, duration + 50);
  });
}

// ラベル描画
function drawLabels(centers) {
  svg.selectAll("text.cluster-label").remove();
  if (!centers) return;
  if (centers.length > 0 && centers[0].name) {
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
  } else if (centers.length > 0 && centers[0].item) {
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