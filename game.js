(() => {
  'use strict';
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const SYMBOLS = { X: 'X', O: 'O' };
  let boards, territoryStatus, currentPlayer, activeBoard, gameOver, winner;
  let lastMove, newestMove, winningLine, endReason;
  let gameMode = 'friend', difficulty = 'medio', isThinking = false, gameToken = 0, aiWorker = null;
  let pendingConfirm = null;
  let history = [];
  const $ = (id) => document.getElementById(id);
  const screens = { home:$('homeScreen'), difficulty:$('difficultyScreen'), game:$('gameScreen') };
  const megaBoardEl = $('megaBoard');
  const difficultyNames = { facil:'Fácil', medio:'Médio', hard:'Hard', inferno:'Inferno' };

  function showScreen(which) {
    Object.entries(screens).forEach(([name, el]) => el.classList.toggle('hidden', name !== which));
    window.scrollTo({top:0,behavior:'instant'});
  }
  function captureState() {
    return {boards:boards.map(row=>row.slice()),territoryStatus:territoryStatus.slice(),currentPlayer,activeBoard,gameOver,winner,
      lastMove:lastMove?{...lastMove}:null,newestMove:newestMove?{...newestMove}:null,winningLine:winningLine?winningLine.slice():null,endReason};
  }
  function saveHistory() {
    history.push(captureState());
    // Estado atual + até três estados anteriores.
    if (history.length > 4) history.shift();
    updateUndoButton();
  }
  function restoreState(state) {
    boards=state.boards.map(row=>row.slice()); territoryStatus=state.territoryStatus.slice();
    currentPlayer=state.currentPlayer; activeBoard=state.activeBoard; gameOver=state.gameOver; winner=state.winner;
    lastMove=state.lastMove?{...state.lastMove}:null; newestMove=state.newestMove?{...state.newestMove}:null;
    winningLine=state.winningLine?state.winningLine.slice():null; endReason=state.endReason; isThinking=false;
    render();
  }
  function updateUndoButton() {
    const btn=$('undoButton'); if (!btn) return;
    btn.disabled = history.length <= 1 || isThinking;
    btn.title = btn.disabled ? 'Não há jogadas disponíveis para desfazer' : `Desfazer (até ${Math.min(3,history.length-1)} movimento(s))`;
  }
  function undoMove() {
    if (isThinking || history.length <= 1) return;
    // Em partidas contra a IA, volta até a vez do humano, desfazendo a resposta da IA e, se necessário, a jogada humana.
    history.pop();
    let state=history[history.length-1];
    if (gameMode==='ai' && state && state.currentPlayer==='O' && history.length>1) {
      history.pop(); state=history[history.length-1];
    }
    restoreState(state); updateUndoButton();
  }
  function resetModel() {
    boards = Array.from({length:9}, () => Array(9).fill(null));
    territoryStatus = Array(9).fill(null);
    currentPlayer = 'X'; activeBoard = null; gameOver = false; winner = null;
    lastMove = null; newestMove = null; winningLine = null; endReason = null; isThinking = false;
    history = []; saveHistory();
    render();
  }
  function startGame(mode, level='medio') {
    stopWorker(); gameToken++;
    gameMode = mode; difficulty = level; resetModel(); showScreen('game');
    if (mode === 'ai' && currentPlayer === 'O') scheduleAI();
  }
  function stopWorker() { if (aiWorker) { try { aiWorker.terminate(); } catch (_) {} aiWorker = null; } }
  function miniWinner(cells) {
    for (const line of LINES) { const [a,b,c] = line; if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return {player:cells[a],line}; }
    return null;
  }
  function megaWinners(status=territoryStatus) {
    const result = {X:[],O:[]};
    for (const line of LINES) {
      const values = line.map(i => status[i]);
      for (const player of ['X','O']) {
        const own = values.filter(v => v === player).length;
        if (own >= 2 && values.every(v => v === player || v === 'P')) result[player].push(line);
      }
    }
    return result;
  }
  function takeTurn(boardIndex, cellIndex) {
    if (gameOver || isThinking || (gameMode === 'ai' && currentPlayer === 'O')) return;
    if (territoryStatus[boardIndex] !== null) return;
    if (activeBoard !== null && activeBoard !== boardIndex) return;
    if (boards[boardIndex][cellIndex] !== null) return;
    const mover = currentPlayer;
    boards[boardIndex][cellIndex] = mover;
    newestMove = {boardIndex,cellIndex};
    const found = miniWinner(boards[boardIndex]);
    let eventText = '';
    if (found) { territoryStatus[boardIndex] = found.player; eventText = `Território ${boardIndex+1} conquistado por ${found.player}.`; }
    else if (boards[boardIndex].every(Boolean)) { territoryStatus[boardIndex] = 'P'; eventText = `O território ${boardIndex+1} virou uma pirâmide coringa.`; }
    lastMove = {player:mover,boardIndex,cellIndex,eventText};
    currentPlayer = mover === 'X' ? 'O' : 'X';
    const potential = megaWinners();
    const xWins = potential.X.length > 0, oWins = potential.O.length > 0;
    if (xWins || oWins) { winner = xWins && oWins ? currentPlayer : (xWins ? 'X' : 'O'); winningLine = potential[winner][0]; gameOver = true; endReason = 'win'; }
    else if (territoryStatus.every(status => status !== null)) { gameOver = true; endReason = 'draw'; }
    activeBoard = gameOver ? null : (territoryStatus[cellIndex] === null ? cellIndex : null);
    saveHistory(); render();
    if (!gameOver && gameMode === 'ai' && currentPlayer === 'O') scheduleAI();
  }

  function chalkSymbol(symbol, large=false) {
    const color = symbol === 'X' ? 'var(--x)' : 'var(--o)';
    const paths = symbol === 'X'
      ? `<path d="M23 22 L76 78 M76 21 L22 79"/><path d="M22 24 L74 76 M77 23 L24 77" opacity=".35" stroke-width="2.8"/>`
      : `<path d="M50 17 C70 15 81 30 80 49 C79 68 66 81 49 81 C30 80 18 66 19 48 C19 30 32 18 50 17 Z"/><path d="M52 20 C68 20 77 33 76 49 C75 65 63 77 49 77 C33 77 22 64 22 48 C22 33 35 21 52 20 Z" opacity=".35" stroke-width="2.8"/>`;
    return `<span class="cell-symbol${large?' large':''}"><svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="${large?7:8}" stroke-linecap="round" stroke-linejoin="round" opacity=".97">${paths}</g><g fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" opacity=".72">${symbol==='X'?'<path d="M27 20 L74 80 M78 25 L21 76"/>':'<path d="M49 15 C72 14 84 31 82 50 C80 72 66 84 48 83 C28 82 16 66 17 47 C18 28 31 16 49 15 Z"/>'}</g></svg></span>`;
  }
  function pyramidSVG() {
    return `<div class="pyramid" aria-label="Pirâmide coringa"><svg viewBox="0 0 100 100" role="img" aria-hidden="true"><g stroke="var(--pyramid)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M50 12 L11 82 L89 82 Z" fill="rgba(242,223,137,.1)"/><path d="M50 12 L50 82 L11 82 Z" fill="rgba(242,223,137,.12)"/><path d="M50 12 L89 82 L50 82 Z" fill="rgba(242,223,137,.04)"/><path d="M50 12 L51 81" stroke-dasharray="4 4" opacity=".8"/><path d="M11 82 L50 67 L89 82" fill="none" opacity=".9"/></g></svg></div>`;
  }
  function renderBoard(boardIndex) {
    const state = territoryStatus[boardIndex];
    const outer = document.createElement('div');
    outer.className = 'mini-board'; outer.dataset.board = String(boardIndex);
    if (state !== null) outer.classList.add('resolved');
    const validBoard = activeBoard === null || activeBoard === boardIndex;
    const playerLocked = gameMode === 'ai' && (isThinking || currentPlayer === 'O');
    if (!gameOver && activeBoard === boardIndex && state === null) outer.classList.add('active');
    else if (!gameOver && activeBoard !== null && state === null) outer.classList.add('locked');
    const index = document.createElement('span'); index.className = 'mini-index'; index.textContent = String(boardIndex+1).padStart(2,'0'); outer.appendChild(index);
    const grid = document.createElement('div'); grid.className = 'mini-grid';
    if (state !== null) grid.classList.add('finished');
    for (let cellIndex=0; cellIndex<9; cellIndex++) {
      const cell = document.createElement('button'); cell.type='button'; cell.className='cell';
      const value = boards[boardIndex][cellIndex];
      if (value) { cell.innerHTML = chalkSymbol(value); cell.classList.add(value==='X'?'mark-x':'mark-o'); }
      if (newestMove && newestMove.boardIndex===boardIndex && newestMove.cellIndex===cellIndex) cell.classList.add('new-mark');
      const canPlay = !gameOver && !playerLocked && state===null && value===null && validBoard;
      cell.disabled = !canPlay;
      if (canPlay) cell.classList.add('can-play');
      cell.setAttribute('aria-label',`Território ${boardIndex+1}, casa ${cellIndex+1}${value?`, ${value}`:', vazia'}`);
      cell.addEventListener('click',()=>takeTurn(boardIndex,cellIndex)); grid.appendChild(cell);
    }
    outer.appendChild(grid);
    const overlay = document.createElement('div'); overlay.className='territory-mark';
    if (state==='X' || state==='O') { overlay.innerHTML=`<span class="territory-symbol">${chalkSymbol(state,true)}</span>`; overlay.setAttribute('aria-label',`Território conquistado por ${state}`); }
    else if (state==='P') { overlay.innerHTML=pyramidSVG(); overlay.setAttribute('aria-label','Território empatado, pirâmide coringa'); }
    outer.appendChild(overlay);
    if (winningLine && winningLine.includes(boardIndex)) outer.classList.add('main-winning-cell');
    return outer;
  }
  function render() {
    megaBoardEl.innerHTML='';
    for (let i=0;i<9;i++) megaBoardEl.appendChild(renderBoard(i));
    const mark = $('turnMark'), text = $('turnText'), detail = $('turnDetail');
    mark.className='turn-mark';
    if (gameOver) {
      mark.classList.add('done'); mark.innerHTML = endReason==='draw' ? '＝' : '✦';
      if (endReason==='draw') { text.textContent='Empate!'; detail.textContent='Todos os territórios foram encerrados sem uma linha vencedora.'; }
      else if (gameMode==='ai') { text.textContent = winner==='X' ? 'Você venceu!' : 'A IA venceu!'; detail.textContent = winner==='X' ? 'Boa estratégia. Vamos jogar outra?' : `A IA ${difficultyNames[difficulty]} conquistou a linha principal.`; }
      else { text.textContent=`Vitória do ${winner}!`; detail.textContent='Linha de três territórios conquistada.'; }
      const dance = gameMode==='ai' && winner==='O' ? `<div class="dance-celebration" role="img" aria-label="Mascote de giz comemorando a vitória da IA"><svg class="chalk-dancer" viewBox="0 0 100 112" aria-hidden="true"><g fill="none" stroke="var(--chalk)" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"><g class="leg-left"><path d="M45 74 L39 91 L30 98"/><path d="M23 99 L33 99"/></g><g class="leg-right"><path d="M55 74 L61 91 L70 98"/><path d="M67 99 L77 99"/></g><g class="body"><path d="M50 42 L50 75" stroke="var(--x)" stroke-width="7"/><circle cx="50" cy="27" r="15"/><path d="M43 27 L46 28 M55 28 L58 27" stroke-width="3"/><path d="M44 34 Q50 39 57 33" stroke-width="2.5"/><path d="M39 48 L31 65 M61 48 L69 65" stroke="var(--x)" stroke-width="6"/></g><g class="arm-left"><path d="M40 48 L26 36 L20 22"/><path d="M16 24 L20 17 L25 22" stroke="var(--o)"/></g><g class="arm-right"><path d="M60 48 L74 36 L80 22"/><path d="M75 22 L80 17 L84 24" stroke="var(--o)"/></g><path d="M17 11 l-3 -5 M83 10 l4 -5 M9 45 l-6 -2 M91 44 l6 -3" stroke="var(--pyramid)" stroke-width="2.5"/></g></svg><span>A IA está comemorando!<br><small style="font:600 12px 'Trebuchet MS',sans-serif;color:var(--chalk-soft)">Tente a revanche…</small></span></div>` : '';
      $('resultActions').innerHTML = dance + '<button type="button" id="playAgain" class="chalk-button primary">↻ Jogar novamente</button><button type="button" id="resultMenu" class="chalk-button">Voltar ao menu</button>';
      $('playAgain').addEventListener('click',()=>startGame(gameMode,difficulty));
      $('resultMenu').addEventListener('click',()=>requestMenu());
    } else {
      const shownPlayer = currentPlayer;
      mark.classList.add(shownPlayer==='O'?'o':'x'); mark.innerHTML=chalkSymbol(shownPlayer,true);
      if (gameMode==='ai' && shownPlayer==='O') { text.textContent=isThinking?'A IA está pensando…':'Vez da IA (O)'; detail.innerHTML=isThinking?'Calculando as jogadas mais promissoras<span class="thinking-dot"></span>':`Dificuldade ${difficultyNames[difficulty]}.`; }
      else { text.textContent=`Agora é a vez do ${shownPlayer}!`; detail.textContent = !lastMove ? (gameMode==='ai'?'Você começa no X. Escolha qualquer território.':'Escolha qualquer território para começar.') : (activeBoard===null ? 'Destino livre: escolha qualquer território disponível.' : `Jogue no território ${activeBoard+1}.`); }
      $('resultActions').innerHTML='';
    }
    updateUndoButton();
  }

  function openRules() { $('rulesModal').classList.add('open'); $('closeRules').focus(); }
  function closeRules() { $('rulesModal').classList.remove('open'); }
  function askConfirm(action) {
    const resumeAI = isThinking && gameMode === 'ai' && currentPlayer === 'O' && !gameOver;
    if (resumeAI) { stopWorker(); gameToken++; isThinking = false; render(); }
    pendingConfirm={action,resumeAI};
    $('confirmTitle').textContent=action==='menu'?'Voltar ao menu?':'Reiniciar a partida?';
    $('confirmMessage').textContent=action==='menu'?'A partida atual será abandonada. Quer voltar para a seleção de modo?':'Todo o progresso desta partida será apagado.';
    $('acceptConfirm').textContent=action==='menu'?'Voltar ao menu':'Sim, reiniciar';
    $('confirmModal').classList.add('open'); $('cancelConfirm').focus();
  }
  function closeConfirm() {
    const pending = pendingConfirm; $('confirmModal').classList.remove('open'); pendingConfirm=null;
    if (pending && pending.resumeAI && gameMode === 'ai' && !gameOver && currentPlayer === 'O') scheduleAI();
  }
  function requestReset() { if (!gameOver && lastMove) askConfirm('reset'); else { stopWorker(); gameToken++; resetModel(); } }
  function requestMenu() { if (!gameOver && lastMove) askConfirm('menu'); else { stopWorker(); gameToken++; isThinking=false; history=[]; resetModel(); showScreen('home'); } }
  function acceptConfirmation() {
    const action=pendingConfirm && pendingConfirm.action; pendingConfirm=null; $('confirmModal').classList.remove('open'); stopWorker(); gameToken++; isThinking=false;
    if (action==='menu') { history=[]; resetModel(); showScreen('home'); } else { resetModel(); }
  }
  $('friendMode').addEventListener('click',()=>startGame('friend'));
  $('aiMode').addEventListener('click',()=>{difficulty='medio';updateDifficultyButtons();showScreen('difficulty');});
  $('backHome').addEventListener('click',()=>showScreen('home'));
  $('startAI').addEventListener('click',()=>startGame('ai',difficulty));
  document.querySelectorAll('[data-difficulty]').forEach(btn=>btn.addEventListener('click',()=>{difficulty=btn.dataset.difficulty;updateDifficultyButtons();}));
  function updateDifficultyButtons() { document.querySelectorAll('[data-difficulty]').forEach(btn=>{const sel=btn.dataset.difficulty===difficulty;btn.classList.toggle('selected',sel);btn.setAttribute('aria-pressed',String(sel));}); }
  $('restartButton').addEventListener('click',requestReset);
  $('undoButton').addEventListener('click',undoMove);
  $('menuButton').addEventListener('click',requestMenu);
  $('helpHome').addEventListener('click',openRules);
  $('closeRules').addEventListener('click',closeRules); $('closeRulesBottom').addEventListener('click',closeRules);
  $('rulesModal').addEventListener('click',event=>{if(event.target===$('rulesModal'))closeRules();});
  $('cancelConfirm').addEventListener('click',closeConfirm); $('cancelConfirmX').addEventListener('click',closeConfirm);
  $('acceptConfirm').addEventListener('click',acceptConfirmation);
  $('confirmModal').addEventListener('click',event=>{if(event.target===$('confirmModal'))closeConfirm();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeRules();if($('confirmModal').classList.contains('open'))closeConfirm();}});

  function scheduleAI() {
    if (gameOver || gameMode!=='ai' || currentPlayer!=='O' || isThinking) return;
    isThinking=true; render(); const token=gameToken;
    window.setTimeout(()=>{
      if (token!==gameToken || gameMode!=='ai' || gameOver || currentPlayer!=='O') return;
      const state={boards:boards.map(row=>row.slice()),territoryStatus:territoryStatus.slice(),currentPlayer,activeBoard,gameOver,winner};
      try {
        const blob=new Blob([`(${aiWorkerMain.toString()})();`],{type:'text/javascript'});
        const url=URL.createObjectURL(blob); const worker=new Worker(url); URL.revokeObjectURL(url); aiWorker=worker;
        worker.onmessage=(event)=>{
          if (token!==gameToken) { worker.terminate(); if(aiWorker===worker)aiWorker=null; return; }
          const move=event.data && event.data.move;
          worker.terminate(); if(aiWorker===worker)aiWorker=null; isThinking=false;
          if (move && Number.isInteger(move.boardIndex) && Number.isInteger(move.cellIndex) && territoryStatus[move.boardIndex]===null && boards[move.boardIndex][move.cellIndex]===null && (activeBoard===null || activeBoard===move.boardIndex)) takeTurnFromAI(move.boardIndex,move.cellIndex);
          else { const legal=pageLegalMoves(); if(legal.length) takeTurnFromAI(legal[0].boardIndex,legal[0].cellIndex); else render(); }
        };
        worker.onerror=()=>{ worker.terminate(); if(aiWorker===worker)aiWorker=null; if(token!==gameToken)return; isThinking=false; const legal=pageLegalMoves(); if(legal.length)takeTurnFromAI(legal[0].boardIndex,legal[0].cellIndex); else render(); };
        worker.postMessage({state,difficulty,token});
      } catch (error) {
        isThinking=false; const legal=pageLegalMoves(); if(legal.length)takeTurnFromAI(legal[0].boardIndex,legal[0].cellIndex); else render();
      }
    },30);
  }
  function takeTurnFromAI(boardIndex,cellIndex) {
    isThinking=false;
    if(gameOver || currentPlayer!=='O' || territoryStatus[boardIndex]!==null || boards[boardIndex][cellIndex]!==null || (activeBoard!==null && activeBoard!==boardIndex)) { render(); return; }
    const mover=currentPlayer; boards[boardIndex][cellIndex]=mover; newestMove={boardIndex,cellIndex};
    const found=miniWinner(boards[boardIndex]); let eventText='';
    if(found){territoryStatus[boardIndex]=found.player;eventText=`Território ${boardIndex+1} conquistado por ${found.player}.`;}
    else if(boards[boardIndex].every(Boolean)){territoryStatus[boardIndex]='P';eventText=`O território ${boardIndex+1} virou uma pirâmide coringa.`;}
    lastMove={player:mover,boardIndex,cellIndex,eventText}; currentPlayer='X';
    const potential=megaWinners(),xWins=potential.X.length>0,oWins=potential.O.length>0;
    if(xWins||oWins){winner=xWins&&oWins?currentPlayer:(xWins?'X':'O');winningLine=potential[winner][0];gameOver=true;endReason='win';}
    else if(territoryStatus.every(status=>status!==null)){gameOver=true;endReason='draw';}
    activeBoard=gameOver?null:(territoryStatus[cellIndex]===null?cellIndex:null); saveHistory(); render();
  }
  function pageLegalMoves() {
    const moves=[]; const targets=activeBoard===null?[0,1,2,3,4,5,6,7,8]:[activeBoard];
    for(const b of targets)if(territoryStatus[b]===null)for(let c=0;c<9;c++)if(boards[b][c]===null)moves.push({boardIndex:b,cellIndex:c});
    return moves;
  }

  // A busca da IA roda em Web Worker para manter os cliques e as animações responsivos.
  function aiWorkerMain() {
    'use strict';
    const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const opposite=p=>p==='X'?'O':'X';
    self.onmessage=(event)=>{
      const {state,difficulty,token}=event.data;
      try { const move=chooseMove(state,difficulty); self.postMessage({move,token}); }
      catch(_) { const moves=legalMoves(state); self.postMessage({move:moves[0]||null,token}); }
    };
    function miniWinner(cells){for(const line of LINES){const[a,b,c]=line;if(cells[a]&&cells[a]===cells[b]&&cells[a]===cells[c])return cells[a];}return null;}
    function megaWinners(status){const out={X:[],O:[]};for(const line of LINES){const vals=line.map(i=>status[i]);for(const p of ['X','O']){const own=vals.filter(v=>v===p).length;if(own>=2&&vals.every(v=>v===p||v==='P'))out[p].push(line);}}return out;}
    function cloneState(s){return {boards:s.boards.map(b=>b.slice()),territoryStatus:s.territoryStatus.slice(),currentPlayer:s.currentPlayer,activeBoard:s.activeBoard,gameOver:!!s.gameOver,winner:s.winner||null};}
    function legalMoves(s){if(s.gameOver)return[];const out=[],targets=s.activeBoard===null?[0,1,2,3,4,5,6,7,8]:[s.activeBoard];for(const b of targets){if(s.territoryStatus[b]!==null)continue;for(let c=0;c<9;c++)if(s.boards[b][c]===null)out.push({boardIndex:b,cellIndex:c});}return out;}
    function applyMove(s,m){const n=cloneState(s),p=n.currentPlayer,b=m.boardIndex,c=m.cellIndex;n.boards[b][c]=p;const local=miniWinner(n.boards[b]);if(local)n.territoryStatus[b]=local;else if(n.boards[b].every(Boolean))n.territoryStatus[b]='P';n.currentPlayer=opposite(p);const big=megaWinners(n.territoryStatus),x=big.X.length>0,o=big.O.length>0;if(x||o){n.gameOver=true;n.winner=x&&o?n.currentPlayer:(x?'X':'O');n.winningLine=big[n.winner][0];}else if(n.territoryStatus.every(v=>v!==null)){n.gameOver=true;n.winner=null;}n.activeBoard=n.gameOver?null:(n.territoryStatus[c]===null?c:null);return n;}
    function linePotential(status,p){let score=0;for(const line of LINES){const v=line.map(i=>status[i]),own=v.filter(x=>x===p).length,opp=v.filter(x=>x===opposite(p)).length,py=v.filter(x=>x==='P').length,empty=v.filter(x=>x===null).length;if(opp)continue;if(own>=2){if(empty===1)score+=py?245:215;else if(empty===0)score+=800;}else if(own===1){if(py>=1&&empty===1)score+=72;else if(empty>=1)score+=py?11:17;} }return score;}
    function microPotential(cells,p){let score=0;for(const line of LINES){const v=line.map(i=>cells[i]),own=v.filter(x=>x===p).length,opp=v.filter(x=>x===opposite(p)).length,empty=v.filter(x=>x===null).length;if(opp)continue;if(own===2&&empty===1)score+=19;else if(own===1&&empty===2)score+=3.5;}if(cells[4]===p)score+=2.4;for(const i of [0,2,6,8])if(cells[i]===p)score+=.85;return score;}
    function boardImportance(status,index,p){let score=0;for(const line of LINES){if(!line.includes(index))continue;const others=line.filter(i=>i!==index).map(i=>status[i]),opp=others.filter(x=>x===opposite(p)).length,own=others.filter(x=>x===p).length,py=others.filter(x=>x==='P').length,empty=others.filter(x=>x===null).length;if(opp)continue;if(own===2||(own===1&&py===1))score+=240;else if(own===1&&empty===1)score+=85;else if(own===0&&py===2)score+=5;}return score;}
    function evaluate(s,p){if(s.gameOver)return s.winner===p?100000:s.winner===opposite(p)?-100000:0;const st=s.territoryStatus;let score=0;for(let i=0;i<9;i++){if(st[i]===p)score+=92;else if(st[i]===opposite(p))score-=92;else if(st[i]===null){const weight=1+Math.min(1.2,boardImportance(st,i,p)/300);score+=(microPotential(s.boards[i],p)-microPotential(s.boards[i],opposite(p)))*.46*weight;}}score+=linePotential(st,p)-linePotential(st,opposite(p));if(st.filter(x=>x==='P').length)score+=0; if(s.activeBoard!==null&&st[s.activeBoard]===null){const target=s.activeBoard,me=microPotential(s.boards[target],s.currentPlayer),them=microPotential(s.boards[target],opposite(s.currentPlayer));const advantage=(me-them)*.9;score+=s.currentPlayer===p?advantage:-advantage;const meWins=localWinningMoves(s.boards[target],s.currentPlayer),oppWins=localWinningMoves(s.boards[target],opposite(s.currentPlayer));score+=(s.currentPlayer===p?1:-1)*(meWins*18-oppWins*18);}return score;}
    function localWinningMoves(cells,p){let n=0;for(let i=0;i<9;i++)if(cells[i]===null){const copy=cells.slice();copy[i]=p;if(miniWinner(copy)===p)n++;}return n;}
    function immediateWinMove(s,p){for(const m of legalMoves(s)){const child=applyMove(s,m);if(child.gameOver&&child.winner===p)return m;}return null;}
    function hash(s){const enc=v=>v==='X'?'X':v==='O'?'O':v==='P'?'P':'.';let out='';for(const b of s.boards)for(const x of b)out+=enc(x);out+='|';for(const x of s.territoryStatus)out+=enc(x);out+='|'+(s.activeBoard===null?'*':s.activeBoard)+s.currentPlayer+(s.gameOver?'!':'')+(s.winner||'-');return out;}
    let deadline=0,nodes=0,table=new Map(),rootPlayer='O',limits=null;
    function timedCheck(){nodes++;if((nodes&127)===0&&Date.now()>deadline)throw new Error('SEARCH_TIMEOUT');}
    function orderedMoves(s,limit,checkThreat){const player=s.currentPlayer,raw=legalMoves(s),ranked=[],doThreatCheck=checkThreat&&raw.length<=18;for(const m of raw){timedCheck();const child=applyMove(s,m);let val=evaluate(child,player);if(child.gameOver&&child.winner===player)val+=1000000;if(doThreatCheck&&!child.gameOver){const replies=legalMoves(child);let dangerous=false;for(const reply of replies){const grand=applyMove(child,reply);if(grand.gameOver&&grand.winner===child.currentPlayer){dangerous=true;break;}}if(dangerous)val-=65000;}const b=m.boardIndex,c=m.cellIndex;if(c===4)val+=4;else if([0,2,6,8].includes(c))val+=1.2;if(b===4)val+=1.5;ranked.push({move:m,val,won:child.gameOver&&child.winner===player});}ranked.sort((a,b)=>b.val-a.val);if(ranked.length<=limit)return ranked;const chosen=ranked.slice(0,limit);for(const item of ranked)if(item.won&&!chosen.some(x=>x.move.boardIndex===item.move.boardIndex&&x.move.cellIndex===item.move.cellIndex))chosen.push(item);return chosen;}
    function search(s,depth,alpha,beta,ply){timedCheck();if(s.gameOver)return s.winner===rootPlayer?100000-ply:s.winner===opposite(rootPlayer)?-100000+ply:0;if(depth<=0)return evaluate(s,rootPlayer);const key=hash(s),old=table.get(key),origA=alpha,origB=beta;if(old&&old.depth>=depth){if(old.flag==='exact')return old.value;if(old.flag==='lower')alpha=Math.max(alpha,old.value);else if(old.flag==='upper')beta=Math.min(beta,old.value);if(alpha>=beta)return old.value;}const maximizing=s.currentPlayer===rootPlayer;const branch=depth>=3?limits.deep:limits.shallow;const options=orderedMoves(s,branch,depth>=2&&legalMoves(s).length<=18);if(!options.length)return 0;let best=maximizing?-Infinity:Infinity,bestMove=null;for(const item of options){const val=search(applyMove(s,item.move),depth-1,alpha,beta,ply+1);if(maximizing){if(val>best){best=val;bestMove=item.move;}alpha=Math.max(alpha,best);}else{if(val<best){best=val;bestMove=item.move;}beta=Math.min(beta,best);}if(beta<=alpha)break;}let flag='exact';if(best<=origA)flag='upper';else if(best>=origB)flag='lower';if(table.size>60000)table.clear();table.set(key,{depth,value:best,flag,bestMove});return best;}
    function chooseMove(state,level){const moves=legalMoves(state);if(!moves.length)return null;rootPlayer=state.currentPlayer;const won=immediateWinMove(state,rootPlayer);if(won)return won;
      const params={facil:{depth:1,root:100,shallow:100,deep:100,ms:90},medio:{depth:2,root:28,shallow:16,deep:13,ms:380},hard:{depth:4,root:24,shallow:13,deep:10,ms:1050},inferno:{depth:6,root:28,shallow:15,deep:12,ms:1900}}[level]||{depth:2,root:28,shallow:16,deep:13,ms:380};
      limits=params;deadline=Date.now()+params.ms;nodes=0;table=new Map();let fallback=moves[0];
      if(level==='facil'){
        try{const rank=orderedMoves(state,Math.min(moves.length,24),true);if(rank.length){const pool=rank.slice(0,Math.min(5,rank.length));let pick;if(Math.random()<.53)pick=pool[0];else pick=pool[Math.floor(Math.random()*pool.length)];return pick.move;}}catch(_){}return fallback;
      }
      try{const root=orderedMoves(state,params.root,true);if(root.length)fallback=root[0].move;}catch(_){return fallback;}
      let best=fallback;
      for(let depth=1;depth<=params.depth;depth++){
        try{
          let alpha=-Infinity,beta=Infinity,iterationBest=best,iterationValue=-Infinity;
          const rootMoves=orderedMoves(state,params.root,true);
          for(const item of rootMoves){timedCheck();const value=search(applyMove(state,item.move),depth-1,alpha,beta,1);if(value>iterationValue){iterationValue=value;iterationBest=item.move;}alpha=Math.max(alpha,iterationValue);}
          best=iterationBest;
        }catch(error){break;}
      }
      return best;
    }
  }

  showScreen('home'); updateDifficultyButtons();
})();
