from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"replacement target not found: {label}")
    return text.replace(old, new, 1)


def update_app() -> None:
    path = Path('app.js')
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "import { chooseCpuMove } from './engine/cpu.js';\n",
        "import { chooseCpuMove } from './engine/cpu.js';\n"
        "import { AUTO_STRATEGY, resolveStrategy, strategyLabel } from './engine/opening-book.js';\n",
        'app import',
    )
    text = replace_once(
        text,
        "const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);\n",
        "const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);\n"
        "const STRATEGIES = new Set([AUTO_STRATEGY, 'yagura', 'mino', 'bogin']);\n"
        "const CPU_TIME_LIMITS = Object.freeze({ easy: 1200, normal: 2000, hard: 3500 });\n",
        'app constants',
    )
    text = replace_once(
        text,
        "  whiteCpuDifficulty: document.querySelector('#whiteCpuDifficulty'),\n"
        "  cpuVsCpuSpeed: document.querySelector('#cpuVsCpuSpeed'),",
        "  whiteCpuDifficulty: document.querySelector('#whiteCpuDifficulty'),\n"
        "  blackCpuStrategy: document.querySelector('#blackCpuStrategy'),\n"
        "  whiteCpuStrategy: document.querySelector('#whiteCpuStrategy'),\n"
        "  cpuVsCpuSpeed: document.querySelector('#cpuVsCpuSpeed'),",
        'app elements',
    )
    text = replace_once(
        text,
        "function createState(overrides = {}) {\n",
        "function randomCpuStrategies() {\n"
        "  return {\n"
        "    [BLACK]: resolveStrategy(AUTO_STRATEGY),\n"
        "    [WHITE]: resolveStrategy(AUTO_STRATEGY),\n"
        "  };\n"
        "}\n\n"
        "function selectedStrategy(element) {\n"
        "  const value = STRATEGIES.has(element?.value) ? element.value : AUTO_STRATEGY;\n"
        "  return resolveStrategy(value);\n"
        "}\n\n"
        "function createState(overrides = {}) {\n",
        'app strategy helpers',
    )
    text = replace_once(
        text,
        "    cpuConfig: { [BLACK]: 'normal', [WHITE]: 'normal' },\n"
        "    cpuDelay: 650,",
        "    cpuConfig: { [BLACK]: 'normal', [WHITE]: 'normal' },\n"
        "    cpuStrategy: randomCpuStrategies(),\n"
        "    cpuDelay: 650,",
        'app state strategy',
    )
    text = replace_once(
        text,
        "    cpuConfig: { ...state.cpuConfig },\n"
        "    cpuDelay: state.cpuDelay,",
        "    cpuConfig: { ...state.cpuConfig },\n"
        "    cpuStrategy: { ...state.cpuStrategy },\n"
        "    cpuDelay: state.cpuDelay,",
        'app reset strategy',
    )
    text = replace_once(
        text,
        "  if (state.mode === 'cpu') {\n"
        "    elements.blackLabel.textContent = state.humanPlayer === BLACK ? 'あなた・先手' : `CPU・先手`;\n"
        "    elements.whiteLabel.textContent = state.humanPlayer === WHITE ? 'あなた・後手' : `CPU・後手`;\n"
        "    elements.modeText.textContent = `CPU対戦・${state.humanPlayer === BLACK ? '先手' : '後手'}・${difficultyName(cpuDifficulty)}`;\n",
        "  if (state.mode === 'cpu') {\n"
        "    const cpuPlayer = opponent(state.humanPlayer);\n"
        "    const cpuStrategyName = strategyLabel(state.cpuStrategy[cpuPlayer]);\n"
        "    elements.blackLabel.textContent = state.humanPlayer === BLACK ? 'あなた・先手' : `CPU・先手・${cpuStrategyName}`;\n"
        "    elements.whiteLabel.textContent = state.humanPlayer === WHITE ? 'あなた・後手' : `CPU・後手・${cpuStrategyName}`;\n"
        "    elements.modeText.textContent = `CPU対戦・${state.humanPlayer === BLACK ? '先手' : '後手'}・${difficultyName(cpuDifficulty)}・${cpuStrategyName}`;\n",
        'app cpu labels',
    )
    text = replace_once(
        text,
        "    elements.blackLabel.textContent = `CPU・先手・${difficultyName(state.cpuConfig[BLACK])}`;\n"
        "    elements.whiteLabel.textContent = `CPU・後手・${difficultyName(state.cpuConfig[WHITE])}`;\n"
        "    elements.modeText.textContent = `CPU同士・${difficultyName(state.cpuConfig[BLACK])} 対 ${difficultyName(state.cpuConfig[WHITE])}`;",
        "    elements.blackLabel.textContent = `CPU・先手・${difficultyName(state.cpuConfig[BLACK])}・${strategyLabel(state.cpuStrategy[BLACK])}`;\n"
        "    elements.whiteLabel.textContent = `CPU・後手・${difficultyName(state.cpuConfig[WHITE])}・${strategyLabel(state.cpuStrategy[WHITE])}`;\n"
        "    elements.modeText.textContent = `CPU同士・${strategyLabel(state.cpuStrategy[BLACK])} 対 ${strategyLabel(state.cpuStrategy[WHITE])}`;",
        'app cpu-vs-cpu labels',
    )
    text = replace_once(
        text,
        "function cpuDelayMs() {\n",
        "function cpuStrategyForTurn() {\n"
        "  return state.cpuStrategy[state.position.turn] || null;\n"
        "}\n\n"
        "function cpuDelayMs() {\n",
        'app strategy turn',
    )
    text = replace_once(
        text,
        "      const move = await chooseCpuMove(position, difficulty, {\n"
        "        timeLimitMs: difficulty === 'hard' ? 520 : difficulty === 'normal' ? 170 : 40,\n"
        "      });",
        "      const move = await chooseCpuMove(position, difficulty, {\n"
        "        timeLimitMs: CPU_TIME_LIMITS[difficulty] || CPU_TIME_LIMITS.normal,\n"
        "        strategy: cpuStrategyForTurn(),\n"
        "      });",
        'app cpu options',
    )
    text = replace_once(
        text,
        "  state = createState({ mode: 'cpu', humanPlayer: preferredHumanPlayer, viewPlayer: preferredHumanPlayer });",
        "  state = createState({\n"
        "    mode: 'cpu',\n"
        "    humanPlayer: preferredHumanPlayer,\n"
        "    viewPlayer: preferredHumanPlayer,\n"
        "    cpuStrategy: randomCpuStrategies(),\n"
        "  });",
        'app cpu mode strategy',
    )
    text = replace_once(
        text,
        "  const whiteDifficulty = DIFFICULTIES.has(elements.whiteCpuDifficulty.value) ? elements.whiteCpuDifficulty.value : 'normal';\n"
        "  state = createState({",
        "  const whiteDifficulty = DIFFICULTIES.has(elements.whiteCpuDifficulty.value) ? elements.whiteCpuDifficulty.value : 'normal';\n"
        "  const blackStrategy = selectedStrategy(elements.blackCpuStrategy);\n"
        "  const whiteStrategy = selectedStrategy(elements.whiteCpuStrategy);\n"
        "  state = createState({",
        'app cpu-vs-cpu strategy selection',
    )
    text = replace_once(
        text,
        "    cpuConfig: { [BLACK]: blackDifficulty, [WHITE]: whiteDifficulty },\n"
        "    cpuDelay: Number(elements.cpuVsCpuSpeed.value) || 650,",
        "    cpuConfig: { [BLACK]: blackDifficulty, [WHITE]: whiteDifficulty },\n"
        "    cpuStrategy: { [BLACK]: blackStrategy, [WHITE]: whiteStrategy },\n"
        "    cpuDelay: Number(elements.cpuVsCpuSpeed.value) || 650,",
        'app cpu-vs-cpu strategy state',
    )
    path.write_text(text, encoding='utf-8')


def update_index() -> None:
    path = Path('index.html')
    text = path.read_text(encoding='utf-8')
    target = '''          <label>後手CPU
            <select id="whiteCpuDifficulty">
              <option value="easy">やさしい</option>
              <option value="normal" selected>ふつう</option>
              <option value="hard">つよい</option>
            </select>
          </label>
'''
    replacement = target + '''          <label>先手の戦法
            <select id="blackCpuStrategy">
              <option value="auto" selected>おまかせ</option>
              <option value="yagura">矢倉</option>
              <option value="mino">四間飛車・美濃</option>
              <option value="bogin">棒銀</option>
            </select>
          </label>
          <label>後手の戦法
            <select id="whiteCpuStrategy">
              <option value="auto" selected>おまかせ</option>
              <option value="yagura">矢倉</option>
              <option value="mino">四間飛車・美濃</option>
              <option value="bogin">棒銀</option>
            </select>
          </label>
'''
    text = replace_once(text, target, replacement, 'index strategy selectors')
    text = replace_once(
        text,
        '''        </div>
        <button id="startCpuVsCpuButton"''',
        '''        </div>
        <p class="small-note">定跡手が危険な場合は、自動的に通常探索へ切り替わります。</p>
        <button id="startCpuVsCpuButton"''',
        'index strategy note',
    )
    path.write_text(text, encoding='utf-8')


def update_readme() -> None:
    path = Path('README.md')
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        '- CPU同士の自動対戦（一時停止・再開、双方の強さと速度を設定可能）',
        '- CPU同士の自動対戦（一時停止・再開、双方の強さ・戦法・速度を設定可能）',
        'README feature',
    )
    text = replace_once(
        text,
        '''`engine/cpu.js` に軽量なブラウザ内CPUを実装しています。

- `easy`: 1手評価＋上位候補から選択（従来の `normal` 相当）
- `normal`: 最大3手先の反復深化・αβ探索（従来の `hard` 相当）
- `hard`: 置換表・静止探索・反復深化を使う強化探索
''',
        '''`engine/cpu.js` にブラウザ内CPUを実装しています。すべての難易度で置換表、静止探索、反復深化、玉周辺評価を使用し、思考時間と探索上限で強さを分けています。

- `easy`: 旧 `hard` 相当。最大5手先、標準1.2秒
- `normal`: 最大6手先、標準2秒
- `hard`: 最大7手先、標準3.5秒

序盤は `engine/opening-book.js` の簡易定跡を利用します。

- 矢倉
- 四間飛車・美濃囲い
- 棒銀

CPUは対局開始時に戦法を固定します。定跡手が通常探索の最善評価から大きく悪化する場合は、定跡を中断して通常探索へ戻ります。CPU同士対戦では先手・後手それぞれの戦法を指定できます。
''',
        'README CPU section',
    )
    text = replace_once(
        text,
        '''│   ├── cpu.js                # 軽量CPU
│   └── dqn-client.js         # 将来のDQN用空アダプター
''',
        '''│   ├── cpu.js                # αβ探索・静止探索・置換表
│   ├── opening-book.js       # 矢倉・美濃・棒銀の簡易定跡
│   └── dqn-client.js         # 将来のDQN用空アダプター
''',
        'README tree',
    )
    path.write_text(text, encoding='utf-8')


def update_tests() -> None:
    path = Path('tests/engine.test.mjs')
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "import { chooseCpuMove } from '../engine/cpu.js';\n",
        "import { chooseCpuMove } from '../engine/cpu.js';\n"
        "import { findOpeningMove, openingPlan } from '../engine/opening-book.js';\n",
        'tests import',
    )
    text = text.rstrip() + '''


test('opening book starts each supported strategy with its basic first move', () => {
  const expected = {
    yagura: 'm:56:47:0',
    mino: 'm:56:47:0',
    bogin: 'm:61:52:0',
  };
  for (const strategy of Object.keys(expected)) {
    const position = createInitialPosition();
    const entry = findOpeningMove(position, BLACK, strategy, generateLegalMoves(position));
    assert.ok(entry, `${strategy} should have an opening move`);
    assert.equal(moveKey(entry.move), expected[strategy]);
  }
});

test('opening plans are mirrored correctly for the second player', () => {
  const blackPlan = openingPlan('mino', BLACK);
  const whitePlan = openingPlan('mino', WHITE);
  assert.equal(blackPlan.length, whitePlan.length);
  assert.equal(whitePlan[0].from, 80 - blackPlan[0].from);
  assert.equal(whitePlan[0].to, 80 - blackPlan[0].to);
});

test('CPU follows a safe selected opening strategy', async () => {
  const position = createInitialPosition();
  const move = await chooseCpuMove(position, 'easy', {
    strategy: 'bogin',
    timeLimitMs: 120,
    maxDepth: 1,
    quiescenceDepth: 1,
  });
  assert.equal(moveKey(move), 'm:61:52:0');
});
'''
    path.write_text(text, encoding='utf-8')


def update_service_worker() -> None:
    path = Path('service-worker.js')
    text = path.read_text(encoding='utf-8')
    text = replace_once(text, "pocket-shogi-v2", "pocket-shogi-v3", 'cache version')
    text = replace_once(
        text,
        "'./engine/shogi.js', './engine/cpu.js', './engine/dqn-client.js',",
        "'./engine/shogi.js', './engine/cpu.js', './engine/opening-book.js', './engine/dqn-client.js',",
        'cache opening book',
    )
    path.write_text(text, encoding='utf-8')


update_app()
update_index()
update_readme()
update_tests()
update_service_worker()
