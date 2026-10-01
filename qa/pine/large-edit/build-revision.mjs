// Deterministic, reviewable local edit of one full strategy. Does not touch Desktop.
import { readFileSync, writeFileSync } from 'node:fs';
let source = readFileSync('qa/pine/large-edit/baseline.pine', 'utf8').replaceAll('\r\n', '\n');
function replace(before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error('Edit anchor must occur once: ' + before);
  source = source.replace(before, after);
}
replace('// Revision 1 uses fixed ATR brackets. Revision 2 will add lifecycle-aware exits.', '// Revision 2 adds monotonic trailing stops, break-even protection, cooldown, and time exits.');
replace('string revision = "baseline-v1"', 'string revision = "trailing-v2"');
replace('// 05. Diagnostics use bounded arrays and one persistent dashboard.', `// 04b. Exit lifecycle extension: all distances use entry-time risk.
bool useTrailing = input.bool(true, "Enable ATR trailing", group=groupRisk)
float trailStartR = input.float(1.0, "Trailing activation R", minval=0.25, step=0.25, group=groupRisk)
float trailAtrMultiple = input.float(1.5, "Trailing ATR distance", minval=0.25, step=0.25, group=groupRisk)
bool useBreakEven = input.bool(true, "Enable break-even", group=groupRisk)
float breakEvenR = input.float(0.75, "Break-even activation R", minval=0.25, step=0.25, group=groupRisk)
int cooldownBars = input.int(8, "Bars to wait after a loss", minval=0, maxval=100, group=groupRisk)
int maxHoldingBars = input.int(60, "Maximum holding bars", minval=2, maxval=500, group=groupRisk)

// 05. Diagnostics use bounded arrays and one persistent dashboard.`);
replace('f_row(table panel, int row, string key, string value, color valueColor) =>', `// This helper is symmetric; an already tightened stop must never move backward.
f_nextStop(bool isLong, float prior, float entry, float risk, float extreme, float atr) =>
    float favorableR = isLong ? f_divide(extreme - entry, risk, 0) : f_divide(entry - extreme, risk, 0)
    float next = prior
    if useBreakEven and favorableR >= breakEvenR
        next := isLong ? math.max(next, entry) : math.min(next, entry)
    if useTrailing and favorableR >= trailStartR
        float candidate = isLong ? extreme - atr * trailAtrMultiple : extreme + atr * trailAtrMultiple
        next := isLong ? math.max(next, candidate) : math.min(next, candidate)
    next

f_row(table panel, int row, string key, string value, color valueColor) =>`);
replace('var int rejectedSignals = 0', `var int rejectedSignals = 0
var int lastLossBar = na
var int cooldownBlocks = 0
var int trailingMoves = 0
var int breakEvenMoves = 0
var int timeExits = 0
var int ratchetViolations = 0`);
replace('        float pnl = strategy.closedtrades.profit(tradeIndex)', `        float pnl = strategy.closedtrades.profit(tradeIndex)
        if pnl < 0
            lastLossBar := bar_index`);
replace('bool longSignal = commonGate', `int cooldownRemaining = na(lastLossBar) ? 0 : math.max(0, cooldownBars - (bar_index - lastLossBar))
bool cooldownAllowed = cooldownRemaining == 0
if flat and commonGate and not cooldownAllowed and (crossLong or crossShort)
    cooldownBlocks += 1
bool longSignal = commonGate and cooldownAllowed`);
replace('bool shortSignal = commonGate', 'bool shortSignal = commonGate and cooldownAllowed');
replace(`// Baseline exit policy: keep initial ATR stop and target fixed until flat.
if strategy.position_size > 0
    highSinceEntry := math.max(nz(highSinceEntry, high), high)
    strategy.exit("Long bracket", from_entry="Long", stop=stopPrice, limit=targetPrice)

if strategy.position_size < 0
    lowSinceEntry := math.min(nz(lowSinceEntry, low), low)
    strategy.exit("Short bracket", from_entry="Short", stop=stopPrice, limit=targetPrice)`, `// Edited exit policy: ratchet only in the favorable direction after activation.
if strategy.position_size > 0
    highSinceEntry := math.max(nz(highSinceEntry, high), high)
    float previousStop = stopPrice
    stopPrice := f_nextStop(true, stopPrice, strategy.position_avg_price, initialRisk, highSinceEntry, atrValue)
    trailingMoves += stopPrice > previousStop ? 1 : 0
    breakEvenMoves += previousStop < strategy.position_avg_price and stopPrice >= strategy.position_avg_price ? 1 : 0
    ratchetViolations += stopPrice < previousStop ? 1 : 0
    strategy.exit("Long bracket", from_entry="Long", stop=stopPrice, limit=targetPrice)

if strategy.position_size < 0
    lowSinceEntry := math.min(nz(lowSinceEntry, low), low)
    float previousStop = stopPrice
    stopPrice := f_nextStop(false, stopPrice, strategy.position_avg_price, initialRisk, lowSinceEntry, atrValue)
    trailingMoves += stopPrice < previousStop ? 1 : 0
    breakEvenMoves += previousStop > strategy.position_avg_price and stopPrice <= strategy.position_avg_price ? 1 : 0
    ratchetViolations += stopPrice > previousStop ? 1 : 0
    strategy.exit("Short bracket", from_entry="Short", stop=stopPrice, limit=targetPrice)

// Time exits are evaluated after bracket refresh; they do not reverse positions.
if not flat and not na(entryBar) and bar_index - entryBar >= maxHoldingBars
    strategy.close_all(comment="maximum holding bars")
    timeExits += 1`);
replace('table.new(position.top_right, 2, 16, border_width=1)', 'table.new(position.top_right, 2, 21, border_width=1)');
replace('    f_row(dashboard, 15, "Closed trades", str.tostring(strategy.closedtrades), color.white)', `    f_row(dashboard, 15, "Closed trades", str.tostring(strategy.closedtrades), color.white)
    f_row(dashboard, 16, "Cooldown remaining", str.tostring(cooldownRemaining), color.yellow)
    f_row(dashboard, 17, "Cooldown blocks", str.tostring(cooldownBlocks), color.white)
    f_row(dashboard, 18, "Stop / break-even moves", str.tostring(trailingMoves) + " / " + str.tostring(breakEvenMoves), color.white)
    f_row(dashboard, 19, "Time exits", str.tostring(timeExits), color.white)
    f_row(dashboard, 20, "Ratchet violations", str.tostring(ratchetViolations), ratchetViolations == 0 ? color.lime : color.red)`);
replace('QA-LARGE-BASELINE revision=', 'QA-LARGE-EDITED revision=');
source += `    log.info("QA-LARGE-EXITS moves={0}; breakEven={1}; cooldownBlocks={2}; timeExits={3}; violations={4}", trailingMoves, breakEvenMoves, cooldownBlocks, timeExits, ratchetViolations)
`;
writeFileSync('qa/pine/large-edit/edited.pine', source);
const broken = source.replace('math.max(next, candidate)', 'qa_missing_max(next, candidate)');
if (broken === source) throw new Error('Missing error injection anchor');
writeFileSync('qa/pine/large-edit/broken.pine', broken);
console.log(JSON.stringify({baseline_lines:readFileSync('qa/pine/large-edit/baseline.pine','utf8').split('\n').length,
  edited_lines:source.split('\n').length, edited_bytes:Buffer.byteLength(source),
  injected_error_line:broken.split('\n').findIndex(line=>line.includes('qa_missing_max'))+1}));
