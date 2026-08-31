/**
 * 商談管理シートを「1企業1行（サービス横並び）」から
 * 「1サービス1行（縦持ち）」へ変換する Google Apps Script。
 *
 * 使い方
 *   1. 対象スプレッドシートで [拡張機能] > [Apps Script] を開く
 *   2. このファイルの中身を貼り付けて保存
 *   3. 関数 restructureShodanSheet を実行（初回は認可を求められます）
 *
 * 元シートは変更せず、新しいシート「商談管理_新フォーマット」を作成します。
 *
 * 新フォーマット
 *   A〜R   企業・商談の共通情報（同一企業の全行に複製）
 *   S〜Z   商談者／商談日／商談回数／サービス詳細／フェーズ／提案金額／申込期日／失注理由
 *   AA〜AE サービスNo と、旧シートでサービス2以降に紐づいていた
 *          ネクスト期日／ネクストアクション／担当者メモ／文字起こし
 */

var SOURCE_SHEET_NAME = '商談管理';
var TARGET_SHEET_NAME = '商談管理_新フォーマット';

var COMMON_LAST_COL = 18; // R
var SERVICE_WIDTH = 8;
var EXTRA_WIDTH = 4;

// サービスブロックの先頭列（1始まり）: S, AA, AM, AY, BK, BW, CE
var SERVICE_STARTS = [19, 27, 39, 51, 63, 75, 83];
// 各サービスに紐づくネクスト情報の先頭列: AI, AU, BG, BS, CM
// サービス1は共通列 O〜R と同じ内容のため 0（複製しない）。サービス7は対応列なし。
var EXTRA_STARTS = [0, 35, 47, 59, 71, 91, 0];

var SERVICE_HEADERS = [
  '商談者', '商談日', '商談回数', 'サービス詳細',
  'フェーズ', '提案金額', '申込期日', '失注理由'
];
var EXTRA_HEADERS = [
  'サービスNo',
  'ネクスト期日\n(サービス別)',
  'ネクストアクション\n(サービス別)',
  '担当者メモ\n(サービス別)',
  '文字起こし\n(サービス別)'
];

var TOTAL_COLS = 31; // A〜AE

function restructureShodanSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(SOURCE_SHEET_NAME);
  if (!src) {
    throw new Error('シート「' + SOURCE_SHEET_NAME + '」が見つかりません。');
  }

  var lastRow = src.getLastRow();
  var values = src.getRange(1, 1, lastRow, src.getLastColumn()).getValues();
  var header = values[0];

  var out = [];
  var headerRow = [];
  for (var c = 0; c < COMMON_LAST_COL; c++) headerRow.push(header[c]);
  for (var i = 0; i < SERVICE_HEADERS.length; i++) headerRow.push(SERVICE_HEADERS[i]);
  for (var j = 0; j < EXTRA_HEADERS.length; j++) headerRow.push(EXTRA_HEADERS[j]);
  out.push(headerRow);

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row[2] === '' || row[2] === null) continue; // C列（企業名）が空の行は無視

    var common = row.slice(0, COMMON_LAST_COL);

    var filled = [];
    for (var b = 0; b < SERVICE_STARTS.length; b++) {
      if (!isBlockEmpty(row, SERVICE_STARTS[b], SERVICE_WIDTH)) filled.push(b);
    }
    if (filled.length === 0) filled = [-1]; // サービス未入力の企業も1行は残す

    for (var k = 0; k < filled.length; k++) {
      var idx = filled[k];
      var outRow = common.slice();

      if (idx < 0) {
        for (var p = 0; p < SERVICE_WIDTH + EXTRA_HEADERS.length; p++) outRow.push('');
        out.push(outRow);
        continue;
      }

      var s = SERVICE_STARTS[idx] - 1;
      for (var q = 0; q < SERVICE_WIDTH; q++) outRow.push(pick(row, s + q));

      outRow.push(idx + 1);
      var e = EXTRA_STARTS[idx];
      for (var x = 0; x < EXTRA_WIDTH; x++) {
        outRow.push(e ? pick(row, e - 1 + x) : '');
      }
      out.push(outRow);
    }
  }

  var target = ss.getSheetByName(TARGET_SHEET_NAME);
  if (target) {
    target.clear();
  } else {
    target = ss.insertSheet(TARGET_SHEET_NAME);
  }

  target.getRange(1, 1, out.length, TOTAL_COLS).setValues(out);
  formatTarget(target, out.length);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    (out.length - 1) + ' 行を書き出しました', TARGET_SHEET_NAME, 10);
}

function isBlockEmpty(row, startCol, width) {
  for (var i = 0; i < width; i++) {
    var v = row[startCol - 1 + i];
    if (v !== '' && v !== null && v !== undefined) return false;
  }
  return true;
}

function pick(row, index) {
  var v = row[index];
  return (v === null || v === undefined) ? '' : v;
}

function formatTarget(sheet, rowCount) {
  var head = sheet.getRange(1, 1, 1, TOTAL_COLS);
  head.setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  sheet.getRange(1, 1, 1, COMMON_LAST_COL).setBackground('#d9e1f2');
  sheet.getRange(1, 19, 1, SERVICE_WIDTH).setBackground('#fce4d6');
  sheet.getRange(1, 27, 1, EXTRA_HEADERS.length).setBackground('#ededed');

  if (rowCount > 1) {
    var body = rowCount - 1;
    var dateFmt = 'yyyy"年"m"月"d"日"';
    sheet.getRange(2, 12, body, 2).setNumberFormat(dateFmt);  // L,M
    sheet.getRange(2, 15, body, 1).setNumberFormat(dateFmt);  // O
    sheet.getRange(2, 20, body, 1).setNumberFormat(dateFmt);  // T 商談日
    sheet.getRange(2, 25, body, 1).setNumberFormat(dateFmt);  // Y 申込期日
    sheet.getRange(2, 28, body, 1).setNumberFormat(dateFmt);  // AB
    sheet.getRange(2, 21, body, 1).setNumberFormat('#,##0');  // U 商談回数
    sheet.getRange(2, 24, body, 1).setNumberFormat('#,##0');  // X 提案金額
  }

  var widths = [60, 80, 220, 110, 100, 100, 70, 70, 110, 190, 110, 110,
                110, 260, 95, 150, 200, 260, 80, 105, 75, 220, 130, 90,
                105, 160, 80, 105, 150, 200, 260];
  for (var c = 0; c < widths.length; c++) sheet.setColumnWidth(c + 1, widths[c]);

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3);
}
