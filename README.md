# D3.js Bubble Chart 可視化ツール

政務活動費データなどを「バブルチャート」で可視化するためのD3.jsアプリです。  
議員ごと・項目ごと・全体の集計を**重なりなし・最大スケール・アニメーション付き**で直感的に表示します。

---

## ファイル構成

index.html        // メインHTML。コントロールUIやSVG領域
main.js           // 描画・ロジック本体（D3.js使用）
style.css         // スタイルシート
data.csv          // データ本体（議員・項目・金額）
items.csv         // 項目一覧（凡例や並び順固定用）
README.md         // ドキュメント

---

## CSVデータ仕様

### data.csv

| name     | item         | amount  |
|----------|--------------|---------|
| 議員名   | 支出項目     | 金額    |

例：
```csv
name,item,amount
田中太郎,研修費,54000
田中太郎,広報費,26000
山田花子,研修費,42000
...

	•	name: 議員名
	•	item: 支出項目名
	•	amount: 金額（数値, 円）

⸻

items.csv

item
項目名

例：

item
研修費
広報費
資料費
...

	•	凡例の順番を揃えたり、集計項目を限定したい時に使います。

⸻

アプリの特徴
	•	バブルサイズは金額に比例
	•	バブルが重ならない最大スケールを自動算出（特に議員ごと表示）
	•	「全部まとめて」「議員ごと」「項目ごと」モードをUIで簡単切替
	•	議員リストで個別絞り込みも可能
	•	アニメーションでふわっと表示・移動
	•	スマホ・タブレットでもレイアウト自動調整
	•	マウスオーバーで詳細ツールチップ

⸻

各関数の説明・引数・主な変数

グローバル変数

変数	説明
data	全データ配列（data.csvの内容）
items	項目一覧（items.csvの内容）
uniqueNames	全議員名リスト（重複なし）
uniqueItems	全項目名リスト（重複なし）
mode	表示モード（“all”, “name”, “item”）
currentMembers	現在選択中の議員名配列
rScale	金額→バブル半径への変換スケール
width/height	SVGエリアのサイズ


⸻

関数と役割

drawLegend()
	•	項目ごとのカラーバブル凡例を描画

drawMemberSelect()
	•	議員選択用のセレクトボックスを生成・更新
	•	「すべての議員」選択時は全員表示

toggleMemberSelect()
	•	modeによって議員セレクト/ラベルを表示・非表示

toggleSlider()
	•	modeによってサイズスライダーを表示・非表示
	•	議員ごとモード（“name”）時はスライダー非表示

addControls()
	•	UIボタン・スライダー・ウィンドウリサイズのイベント設定

resizeChart()
	•	画面サイズに応じてSVGのwidth/heightを再計算しリサイズ
	•	スマホ縦長時はキャンバスも縦長に

updateBubbles()
	•	表示データを抽出
	•	クラスタの中心点を決定
	•	モードに応じてバブル位置・サイズを算出
	•	議員ごとモードの時は「バブル同士が絶対に接触しない最大スケール」を自動探索
	•	drawBubblesAsync()でアニメ描画

runSimulation(nodes, centers, ticks)
	•	D3-forceでバブル同士が重ならない位置を決定
	•	引数
	•	nodes: 表示するバブル配列
	•	centers: 各クラスタの中心座標
	•	ticks: シミュレーションのイテレーション数

drawBubblesAsync(nodes, centers, duration)
	•	SVGサークル(bubble)をアニメーションで描画
	•	enter: 半径0からrへ
	•	update: なめらか移動
	•	exit: 半径0へ
	•	クラスタラベルも同時にアニメ描画

drawLabels(centers, duration)
	•	クラスタ（議員or項目）のラベルをSVGテキストで描画・アニメ
	•	enter/update/exit全対応

showTooltip(e, d) / hideTooltip()
	•	バブルにマウスオーバーで詳細情報表示/非表示

⸻

議員ごと表示のスケール探索（仕組み解説）
	1.	グリッドで各クラスタ中心座標（centers）を決める
	2.	各議員のデータをそのクラスタ中心に集め、rScaleで初期サイズを決定
	3.	scaleFactor=1から少しずつ0.9倍に縮小しながら
	•	各クラスタ（議員ごと）のバブル群が「外接円」として互いに重なっていないかチェック
	•	もしどこかのクラスタが他と重なるならscaleFactorをさらに縮小
	4.	「全てのクラスタがぶつからない最大スケール」になるまで繰り返し
	5.	最終的なバブル半径=初期半径×scaleFactorで表示

⸻

使い方
	1.	data.csv・items.csvを自分のデータで上書き
	2.	index.htmlをブラウザで開く
	3.	表示モード・議員選択・サイズスライダーでインタラクティブに閲覧

⸻

カスタマイズ例
	•	バブルの色：colorScaleを編集
	•	バブル最小/最大半径：rScale.domain([minA, maxA]).range([12, 38]);の数値を変更
	•	凡例やUI配置はHTMLとCSSを編集


⸻

コントリビューション

バグ報告・要望・改善提案はPR/Issue大歓迎です！

