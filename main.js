// 等待 DOM 完全載入後執行
document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase 初始化 ---
    if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
        console.error("Firebase SDK 或 firebaseConfig 未定義。");
        alert("遊戲核心組件載入失敗，請檢查您的 HTML 設定。");
        return;
    }

    try {
        if (!firebase.apps.length) { 
            firebase.initializeApp(firebaseConfig);
        }
    } catch (e) {
        console.error("Firebase 初始化錯誤:", e);
        alert("無法初始化遊戲服務，請稍後再試或聯繫管理員。");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- 全域狀態與設定 ---
    let currentUser = null;
    let currentLevelId = null;
    let currentLevelConfig = null;
    let currentMinesweeperGame = null;
    let currentJigsawState = { image: null, pieces: [], slots: [], ownedPieceIds: [], placedPieceMap: {} };
    let playerData = { username: '', maxUnlockedLevel: 1, levelProgress: {} };

    // --- UI 元素參照 ---
    const loadingIndicator = document.getElementById('loading-indicator');
    const screens = {
        auth: document.getElementById('auth-screen'),
        levelSelect: document.getElementById('level-select-screen'),
        inLevel: document.getElementById('in-level-screen'),
        minesweeper: document.getElementById('minesweeper-screen'),
        jigsaw: document.getElementById('jigsaw-screen'),
    };

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginEmailInput = document.getElementById('login-username'); 
    const loginPasswordInput = document.getElementById('login-password');
    const registerEmailInput = document.getElementById('register-username'); 
    const registerPasswordInput = document.getElementById('register-password');
    const registerConfirmPasswordInput = document.getElementById('register-confirm-password');
    const loginErrorMsg = document.getElementById('login-error');
    const registerErrorMsg = document.getElementById('register-error');
    const userInfoContainer = document.getElementById('user-info-container');
    const usernameDisplay = document.getElementById('username-display');
    const logoutButton = document.getElementById('logout-button');
    const googleLoginButton = document.getElementById('google-login-button'); 

    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const forgotPasswordSection = document.getElementById('forgot-password-section');
    const resetEmailInput = document.getElementById('reset-email-input');
    const sendResetEmailButton = document.getElementById('send-reset-email-button');
    const cancelResetButton = document.getElementById('cancel-reset-button');
    const resetInfoMessage = document.getElementById('reset-info-message');


    const levelSelectButtonsContainer = document.getElementById('level-select-buttons');
    const currentLevelTitle = document.getElementById('current-level-title');
    const levelPuzzleProgressDisplay = document.getElementById('level-puzzle-progress');
    const minesweeperGridElement = document.getElementById('minesweeper-grid');
    const minesweeperGridContainer = document.getElementById('minesweeper-grid-container');
    const minesLeftDisplay = document.getElementById('mines-left');
    const errorsMadeDisplay = document.getElementById('errors-made');
    const maxErrorsDisplay = document.getElementById('max-errors');
    const minesweeperMessage = document.getElementById('minesweeper-message');
    const jigsawFrameContainer = document.getElementById('jigsaw-frame-container');
    const jigsawPiecesContainer = document.getElementById('jigsaw-pieces-container');
    const jigsawMessage = document.getElementById('jigsaw-message');

    const GAME_LEVELS = [
        { id: 1, name: "第一關", imagePath: "assets/img/第一關拼圖.jpg", puzzlePiecesCount: 9, puzzleRows: 3, puzzleCols: 3, msGridSize: 10, msMines: 12, msMaxErrors: 3 },
        { id: 2, name: "第二關", imagePath: "assets/img/第二關拼圖.jpg", puzzlePiecesCount: 16, puzzleRows: 4, puzzleCols: 4, msGridSize: 25, msMines: 100, msMaxErrors: 3 },
        { id: 3, name: "第三關", imagePath: "assets/img/第三關拼圖.jpg", puzzlePiecesCount: 25, puzzleRows: 5, puzzleCols: 5, msGridSize: 50, msMines: 400, msMaxErrors: 3 },
    ];

    function showScreen(screenId) {
        for (const id in screens) {
            if (screens[id]) { screens[id].classList.remove('active'); }
        }
        if (screens[screenId]) {
            screens[screenId].classList.add('active');
        } 
        else { console.error("要顯示的畫面未找到:", screenId); }
    }

    function showLoading(show) {
        if (loadingIndicator) { loadingIndicator.classList.toggle('active', show); }
    }

    // --- Firebase Authentication ---
    async function registerUser(email, password) {
        if (loginErrorMsg) loginErrorMsg.textContent = '';
        if (registerErrorMsg) registerErrorMsg.textContent = '';

        if (!email || !password) {
            if (registerErrorMsg) registerErrorMsg.textContent = "電子郵件和密碼不能為空。";
            return;
        }
        if (password.length < 6) {
            if (registerErrorMsg) registerErrorMsg.textContent = "密碼長度至少需要6位。";
            return;
        }

        showLoading(true);
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            const defaultUsername = email.split('@')[0] || `玩家${user.uid.substring(0,5)}`;
            
            const initialPlayerData = {
                username: defaultUsername,
                email: user.email, 
                maxUnlockedLevel: 1,
                levelProgress: {}
            };
            await db.collection('playerData').doc(user.uid).set(initialPlayerData);
        } catch (error) {
            console.error("註冊錯誤:", error);
            if (registerErrorMsg) {
                if (error.code === 'auth/email-already-in-use') {
                    registerErrorMsg.textContent = "此電子郵件已被註冊。";
                } else if (error.code === 'auth/invalid-email') {
                    registerErrorMsg.textContent = "電子郵件格式無效。";
                } else {
                    registerErrorMsg.textContent = "註冊失敗：" + error.message;
                }
            }
        }
        showLoading(false);
    }

    async function loginUser(email, password) {
        if (loginErrorMsg) loginErrorMsg.textContent = '';
        if (registerErrorMsg) registerErrorMsg.textContent = '';
        if (!email || !password) {
            if (loginErrorMsg) loginErrorMsg.textContent = "電子郵件和密碼不能為空。";
            return;
        }
        showLoading(true);
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            console.error("登入錯誤:", error);
            if (loginErrorMsg) {
                 if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    loginErrorMsg.textContent = "電子郵件或密碼錯誤。";
                } else if (error.code === 'auth/invalid-email') {
                    loginErrorMsg.textContent = "電子郵件格式無效。";
                }
                 else {
                    loginErrorMsg.textContent = "登入失敗：" + error.message;
                }
            }
        }
        showLoading(false);
    }

    async function signInWithGoogle() {
        if (loginErrorMsg) loginErrorMsg.textContent = '';
        if (registerErrorMsg) registerErrorMsg.textContent = '';
        const provider = new firebase.auth.GoogleAuthProvider();
        showLoading(true);
        try {
            const result = await auth.signInWithPopup(provider);
            const user = result.user;
            const playerDocRef = db.collection('playerData').doc(user.uid);
            const playerDoc = await playerDocRef.get();

            if (!playerDoc.exists) {
                const initialPlayerData = {
                    username: user.displayName || user.email.split('@')[0] || `玩家${user.uid.substring(0,5)}`,
                    email: user.email,
                    maxUnlockedLevel: 1,
                    levelProgress: {}
                };
                await playerDocRef.set(initialPlayerData);
            }
        } catch (error) {
            console.error("Google 登入錯誤:", error);
            if (loginErrorMsg) {
                if (error.code === 'auth/popup-closed-by-user') {
                    loginErrorMsg.textContent = "Google 登入已取消。";
                } else if (error.code === 'auth/account-exists-with-different-credential') {
                    loginErrorMsg.textContent = "此 Google 帳戶的電子郵件已透過其他方式註冊。";
                }
                else {
                    loginErrorMsg.textContent = "Google 登入失敗：" + error.message;
                }
            }
        }
        showLoading(false);
    }


    async function signInGuest() {
        if (loginErrorMsg) loginErrorMsg.textContent = '';
        if (registerErrorMsg) registerErrorMsg.textContent = '';
        showLoading(true);
        try {
            await auth.signInAnonymously();
        } catch (error) {
            console.error("訪客登入錯誤:", error);
            if (loginErrorMsg) loginErrorMsg.textContent = "訪客登入失敗: " + error.message;
        }
        showLoading(false);
    }

    function logoutUser() {
        showLoading(true);
        auth.signOut().catch(error => {
            console.error("登出錯誤:", error);
        }).finally(() => {
            showLoading(false);
        });
    }

    async function handleForgotPassword() {
        if (resetInfoMessage) resetInfoMessage.textContent = '';
        const email = resetEmailInput.value.trim();
        if (!email) {
            if (resetInfoMessage) resetInfoMessage.textContent = "請輸入您的電子郵件地址。";
            return;
        }

        showLoading(true);
        try {
            await auth.sendPasswordResetEmail(email);
            if (resetInfoMessage) {
                resetInfoMessage.textContent = "密碼重設郵件已發送至您的信箱。請檢查您的收件匣（也請檢查垃圾郵件）。";
                resetInfoMessage.style.color = "green"; 
            }
            if (resetEmailInput) resetEmailInput.value = ''; 
        } catch (error) {
            console.error("發送密碼重設郵件錯誤:", error);
            if (resetInfoMessage) {
                resetInfoMessage.style.color = "#e74c3c"; 
                if (error.code === 'auth/invalid-email') {
                    resetInfoMessage.textContent = "您輸入的電子郵件格式無效。";
                } else if (error.code === 'auth/user-not-found') {
                    resetInfoMessage.textContent = "找不到與此電子郵件關聯的帳戶。";
                } else {
                    resetInfoMessage.textContent = "發送郵件失敗：" + error.message;
                }
            }
        }
        showLoading(false);
    }
    
    // --- Firestore Database (資料庫邏輯) ---
    async function loadPlayerData(userId, isAnonymous, authUser) { 
        showLoading(true);
        try {
            const userDocRef = db.collection('playerData').doc(userId);
            const userDoc = await userDocRef.get();

            if (userDoc.exists) {
                playerData = { 
                    username: '', 
                    maxUnlockedLevel: 1, 
                    levelProgress: {}, 
                    ...userDoc.data() 
                }; 
            } else {
                if (isAnonymous) {
                    playerData.username = "訪客玩家";
                } else if (authUser) { 
                    playerData.username = authUser.displayName || (authUser.email ? authUser.email.split('@')[0] : '') || `玩家${userId.substring(0,5)}`;
                    playerData.email = authUser.email || ''; 
                } else {
                    playerData.username = "新玩家";
                }
                playerData.maxUnlockedLevel = 1;
                playerData.levelProgress = {}; 
                
                await userDocRef.set({
                    username: playerData.username,
                    email: playerData.email || '', 
                    maxUnlockedLevel: playerData.maxUnlockedLevel,
                    levelProgress: {} 
                });
            }

            for (let i = 1; i <= playerData.maxUnlockedLevel; i++) {
                if (!playerData.levelProgress[i]) {
                    playerData.levelProgress[i] = {
                        isPuzzleComplete: false,
                        ownedPieces: [], 
                        placedPieces: {} 
                    };
                }
            }
        } catch (error) {
            console.error("載入玩家數據錯誤:", error);
            alert("無法載入您的遊戲進度，請嘗試重新整理。");
        }
        showLoading(false);
    }

    async function savePlayerGlobalData() { 
        if (!currentUser) return;
        try {
            const dataToSave = {
                username: playerData.username, 
                maxUnlockedLevel: playerData.maxUnlockedLevel,
            };
            if (playerData.email) { 
                dataToSave.email = playerData.email;
            }
            await db.collection('playerData').doc(currentUser.uid).set(dataToSave, { merge: true }); 
        } catch (error) {
            console.error("儲存玩家全域數據錯誤:", error);
        }
    }

    async function saveLevelProgress(levelIdToSave) {
        if (!currentUser || !playerData.levelProgress[levelIdToSave]) return;
        try {
            const progressUpdate = {};
            progressUpdate[`levelProgress.${levelIdToSave}`] = playerData.levelProgress[levelIdToSave];
            
            await db.collection('playerData').doc(currentUser.uid).update(progressUpdate);
        } catch (error) {
            console.error(`儲存關卡 ${levelIdToSave} 進度錯誤:`, error);
        }
    }
    
    // --- Minesweeper Game (踩地雷遊戲邏輯) ---
    function createMinesweeperGame(levelCfg) {
        if (!levelCfg || typeof levelCfg.msGridSize !== 'number' || typeof levelCfg.msMines !== 'number' || typeof levelCfg.msMaxErrors !== 'number') {
            console.error("[Minesweeper] 無效的關卡設定:", levelCfg);
            alert("無法建立踩地雷遊戲：關卡設定錯誤。");
            return null; 
        }
        const board = [];
        const { msGridSize: size, msMines: numMines, msMaxErrors: maxErrorsAllowed } = levelCfg;
        let minesToPlace = numMines;
        
        for (let r = 0; r < size; r++) {
            board[r] = [];
            for (let c = 0; c < size; c++) {
                board[r][c] = { r, c, isMine: false, isRevealed: false, isFlagged: false, adjacentMines: 0 };
            }
        }

        while (minesToPlace > 0) {
            const r = Math.floor(Math.random() * size);
            const c = Math.floor(Math.random() * size);
            if (!board[r][c].isMine) {
                board[r][c].isMine = true;
                minesToPlace--;
            }
        }

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c].isMine) continue;
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc].isMine) {
                            count++;
                        }
                    }
                }
                board[r][c].adjacentMines = count;
            }
        }
        return {
            board,
            size,
            numMines,
            maxErrorsAllowed,
            revealedCount: 0,
            flagsPlaced: 0,
            errorsMadeCount: 0,
            gameOver: false,
            gameWon: false
        };
    }

    function renderMinesweeperBoard() {
        if (!currentMinesweeperGame) {
            if(minesweeperGridElement) minesweeperGridElement.innerHTML = '錯誤：遊戲數據未載入。'; 
            return;
        }

        let scrollY = 0;
        let gridContainerTopBeforeRender = 0;
        // 只有在 minesweeperGridContainer 存在且可見時才獲取其位置
        if (minesweeperGridContainer && minesweeperGridContainer.offsetParent !== null) {
            scrollY = window.pageYOffset || document.documentElement.scrollTop;
            gridContainerTopBeforeRender = minesweeperGridContainer.getBoundingClientRect().top;
        }


        const game = currentMinesweeperGame;
        if (!minesweeperGridElement || !minesweeperGridContainer) {
            console.error("[Minesweeper] Grid element or container not found!");
            return;
        }
        minesweeperGridElement.innerHTML = ''; 
        minesweeperGridElement.style.gridTemplateColumns = `repeat(${game.size}, 1fr)`;
        
        const containerWidth = minesweeperGridContainer.clientWidth;
        let cellSize = Math.floor(containerWidth / game.size) - 2; 
        cellSize = Math.max(10, Math.min(cellSize, 30)); 

        if (containerWidth === 0 && game.size > 0) { // 只有在確定會有格子時才警告
            console.warn("[Minesweeper] 容器寬度為 0，格子可能無法正確渲染。請確保畫面在渲染前已可見。");
        }

        game.board.forEach(row => {
            row.forEach(cellData => {
                const cellEl = document.createElement('div');
                cellEl.classList.add('ms-cell');
                cellEl.dataset.r = cellData.r;
                cellEl.dataset.c = cellData.c;
                cellEl.style.width = `${cellSize}px`;
                cellEl.style.height = `${cellSize}px`;
                cellEl.style.fontSize = `${Math.max(8, cellSize * 0.55)}px`; 
                cellEl.style.lineHeight = `${cellSize}px`;

                if (cellData.isFlagged) cellEl.classList.add('flagged');
                if (cellData.isRevealed) {
                    cellEl.classList.add('revealed');
                    if (cellData.isMine) {
                        cellEl.classList.add('mine');
                        cellEl.textContent = '💣';
                    } else if (cellData.adjacentMines > 0) {
                        cellEl.textContent = cellData.adjacentMines;
                        cellEl.dataset.mines = cellData.adjacentMines; 
                    }
                }
                minesweeperGridElement.appendChild(cellEl);
            });
        });
        updateMinesweeperInfo();
        
        requestAnimationFrame(() => {
            if (minesweeperGridContainer && minesweeperGridContainer.offsetParent !== null) {
                const gridContainerTopAfterRender = minesweeperGridContainer.getBoundingClientRect().top;
                const scrollDiff = gridContainerTopAfterRender - gridContainerTopBeforeRender;
                window.scrollBy(0, scrollDiff);
            } else {
                 // Fallback if container was not visible or became invisible
                window.scrollTo(0, scrollY);
            }
        });
    }
    
    function revealMinesweeperCell(r, c, isChording = false) { // 新增 isChording 參數
        if (!currentMinesweeperGame || currentMinesweeperGame.gameOver) return;
        const game = currentMinesweeperGame;
        const cell = game.board[r][c];

        // 如果是 Chording 觸發的，且格子已插旗，則不翻開 (安全 Chording)
        if (isChording && cell.isFlagged) return;

        // 如果格子已翻開 (不是 Chording 觸發的點擊)
        if (cell.isRevealed && !isChording) {
            if (cell.adjacentMines > 0) { // 只有數字格才能觸發 Chording
                let flaggedNeighbors = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < game.size && nc >= 0 && nc < game.size && game.board[nr][nc].isFlagged) {
                            flaggedNeighbors++;
                        }
                    }
                }

                if (flaggedNeighbors === cell.adjacentMines) {
                    // 執行 Chording：翻開周圍未插旗且未翻開的格子
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nr < game.size && nc >= 0 && nc < game.size) {
                                // 對未翻開且未插旗的鄰居遞迴呼叫，標記為 isChording
                                if (!game.board[nr][nc].isRevealed && !game.board[nr][nc].isFlagged) {
                                    revealMinesweeperCell(nr, nc, true);
                                }
                            }
                        }
                    }
                }
            }
            // 如果是已翻開的格子被點擊（無論是否觸發Chording），都不再執行後續的翻開邏輯
            // 但需要重新渲染以反映可能的Chording結果
            if (!isChording) renderMinesweeperBoard(); // 只有在非遞迴的Chording主調用後才渲染
            return; 
        }
        
        // 以下是正常的翻開邏輯 (針對未翻開的格子)
        if (cell.isRevealed || cell.isFlagged) return; // 再次檢查，以防 Chording 遞迴時狀態改變

        cell.isRevealed = true;
        game.revealedCount++;

        if (cell.isMine) {
            game.errorsMadeCount++;
            if (game.errorsMadeCount >= game.maxErrorsAllowed) {
                game.gameOver = true;
                game.gameWon = false;
                if(minesweeperMessage) minesweeperMessage.textContent = "遊戲失敗！踩到太多地雷了。";
                revealAllMines(false); 
            }
        } else {
            if (cell.adjacentMines === 0) { 
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < game.size && nc >= 0 && nc < game.size) {
                            revealMinesweeperCell(nr, nc, true); // 空白格展開時也視為 Chording 的一部分
                        }
                    }
                }
            }
        }
        // 只有在非遞迴的Chording主調用，或者不是由空白格展開觸發的遞迴調用後才渲染和檢查勝利
        if (!isChording) { 
            renderMinesweeperBoard(); 
            if (!game.gameOver) checkMinesweeperWinCondition(); 
        }
    }

    function toggleMinesweeperFlag(r, c) {
        if (!currentMinesweeperGame || currentMinesweeperGame.gameOver) return;
        const game = currentMinesweeperGame;
        const cell = game.board[r][c];

        if (cell.isRevealed) return;

        cell.isFlagged = !cell.isFlagged;
        game.flagsPlaced += cell.isFlagged ? 1 : -1;
        
        renderMinesweeperBoard(); 
    }

    function checkMinesweeperWinCondition() {
        if (!currentMinesweeperGame) return; 
        const game = currentMinesweeperGame;
        if (game.gameOver) return;

        if (game.revealedCount === (game.size * game.size) - game.numMines && game.errorsMadeCount < game.maxErrorsAllowed) {
            game.gameOver = true;
            game.gameWon = true;
            if(minesweeperMessage) minesweeperMessage.textContent = "恭喜！成功完成踩地雷！獲得一個拼圖碎片！";
            awardPuzzlePiece();
            revealAllMines(true); 
        }
    }
    
    function revealAllMines(isWin) {
        if (!currentMinesweeperGame) return; 
        const game = currentMinesweeperGame;
        game.board.forEach(row => {
            row.forEach(cell => {
                if (cell.isMine) {
                    cell.isRevealed = true; 
                    if (isWin) cell.isFlagged = true; 
                }
            });
        });
        renderMinesweeperBoard();
    }

    function updateMinesweeperInfo() {
        if (!currentMinesweeperGame) return;
        const game = currentMinesweeperGame;
        if (minesLeftDisplay) minesLeftDisplay.textContent = game.numMines - game.flagsPlaced;
        if (errorsMadeDisplay) errorsMadeDisplay.textContent = game.errorsMadeCount;
        if (maxErrorsDisplay) maxErrorsDisplay.textContent = game.maxErrorsAllowed;
    }
    
    function awardPuzzlePiece() {
        if (!currentLevelConfig || !playerData.levelProgress[currentLevelId]) {
            console.warn("無法獎勵拼圖：關卡設定或進度未載入。");
            return;
        }
        
        const levelProgress = playerData.levelProgress[currentLevelId];
        const allPieceIdsCurrentLevel = [];
        for (let r = 0; r < currentLevelConfig.puzzleRows; r++) {
            for (let c = 0; c < currentLevelConfig.puzzleCols; c++) {
                allPieceIdsCurrentLevel.push(`piece_r${r}c${c}`);
            }
        }

        const unownedPieceIds = allPieceIdsCurrentLevel.filter(id => !levelProgress.ownedPieces.includes(id));

        if (unownedPieceIds.length > 0) {
            const randomIndex = Math.floor(Math.random() * unownedPieceIds.length);
            const newPieceId = unownedPieceIds[randomIndex];
            levelProgress.ownedPieces.push(newPieceId);
            saveLevelProgress(currentLevelId); 
            console.log("獎勵拼圖碎片:", newPieceId);
            setTimeout(() => alert(`恭喜！獲得拼圖碎片！`), 100); 
        } else {
            console.log("此關卡所有拼圖碎片均已擁有。");
            setTimeout(() => alert("您已擁有此關卡所有拼圖碎片！"), 100);
        }
        updateLevelPuzzleProgressDisplay(); 
    }

    // --- Jigsaw Puzzle (拼圖遊戲邏輯) ---
    let draggedPieceElement = null; 

    async function setupJigsawPuzzle() {
        if (!currentLevelConfig) {
            console.error("無法設定拼圖：currentLevelConfig 未定義。");
            return;
        }
        currentJigsawState = { image: null, pieces: [], slots: [], ownedPieceIds: [], placedPieceMap: {} }; 
        if(jigsawFrameContainer) jigsawFrameContainer.innerHTML = '';
        if(jigsawPiecesContainer) jigsawPiecesContainer.innerHTML = '';
        if(jigsawMessage) jigsawMessage.textContent = '';

        const levelProgress = playerData.levelProgress[currentLevelId];
        if (!levelProgress) {
            if(jigsawMessage) jigsawMessage.textContent = "無法載入拼圖進度。";
            return;
        }
        currentJigsawState.ownedPieceIds = [...levelProgress.ownedPieces]; 
        currentJigsawState.placedPieceMap = {...levelProgress.placedPieces}; 

        const img = new Image();
        img.src = currentLevelConfig.imagePath;
        
        showLoading(true);
        img.onload = () => {
            currentJigsawState.image = img;
            const naturalPieceWidth = img.naturalWidth / currentLevelConfig.puzzleCols;
            const naturalPieceHeight = img.naturalHeight / currentLevelConfig.puzzleRows;
            
            const frameContainerMaxWidth = Math.min(450, window.innerWidth * 0.8); 
            const scale = frameContainerMaxWidth / img.naturalWidth;
            const displayPieceWidth = naturalPieceWidth * scale;
            const displayPieceHeight = naturalPieceHeight * scale;

            jigsawFrameContainer.style.gridTemplateColumns = `repeat(${currentLevelConfig.puzzleCols}, ${displayPieceWidth}px)`;
            jigsawFrameContainer.style.gridTemplateRows = `repeat(${currentLevelConfig.puzzleRows}, ${displayPieceHeight}px)`;
            jigsawFrameContainer.style.width = `${currentLevelConfig.puzzleCols * displayPieceWidth}px`;
            jigsawFrameContainer.style.height = `${currentLevelConfig.puzzleRows * displayPieceHeight}px`;

            for (let r = 0; r < currentLevelConfig.puzzleRows; r++) {
                for (let c = 0; c < currentLevelConfig.puzzleCols; c++) {
                    const pieceId = `piece_r${r}c${c}`;
                    const slotId = `slot_r${r}c${c}`;
                    
                    const slotEl = document.createElement('div');
                    slotEl.classList.add('jigsaw-slot');
                    slotEl.id = slotId;
                    slotEl.dataset.expectedRow = r; 
                    slotEl.dataset.expectedCol = c; 
                    slotEl.style.width = `${displayPieceWidth}px`;
                    slotEl.style.height = `${displayPieceHeight}px`;
                    jigsawFrameContainer.appendChild(slotEl);
                    currentJigsawState.slots.push({ id: slotId, element: slotEl, r, c, correctPieceId: pieceId });

                    slotEl.addEventListener('dragover', e => e.preventDefault()); 
                    slotEl.addEventListener('drop', handleDropOnJigsawSlot);

                    if (currentJigsawState.ownedPieceIds.includes(pieceId)) {
                        const pieceCanvas = document.createElement('canvas');
                        pieceCanvas.width = displayPieceWidth;
                        pieceCanvas.height = displayPieceHeight;
                        pieceCanvas.classList.add('jigsaw-piece');
                        pieceCanvas.id = pieceId;
                        pieceCanvas.dataset.pieceRow = r; 
                        pieceCanvas.dataset.pieceCol = c; 
                        pieceCanvas.draggable = true;

                        const ctx = pieceCanvas.getContext('2d');
                        ctx.drawImage(
                            img,
                            c * naturalPieceWidth,  
                            r * naturalPieceHeight, 
                            naturalPieceWidth,      
                            naturalPieceHeight,     
                            0,                      
                            0,                      
                            displayPieceWidth,      
                            displayPieceHeight      
                        );
                        
                        currentJigsawState.pieces.push({id: pieceId, element: pieceCanvas, r, c, isPlaced: false});

                        pieceCanvas.addEventListener('dragstart', handleJigsawDragStart);
                        pieceCanvas.addEventListener('dragend', handleJigsawDragEnd);

                        if (currentJigsawState.placedPieceMap[pieceId] === slotId) {
                            placeJigsawPieceInSlot(pieceCanvas, slotEl, true); 
                        } else {
                            jigsawPiecesContainer.appendChild(pieceCanvas); 
                        }
                    }
                }
            }
            checkJigsawWin(); 
            showLoading(false);
        };
        img.onerror = () => {
            if(jigsawMessage) jigsawMessage.textContent = "無法載入拼圖圖片: " + currentLevelConfig.imagePath;
            console.error("拼圖圖片載入失敗:", currentLevelConfig.imagePath);
            showLoading(false);
        };
    }

    function handleJigsawDragStart(e) {
        draggedPieceElement = e.target; 
        e.dataTransfer.setData('text/plain', e.target.id); 
        setTimeout(() => {
            if (e.target) e.target.classList.add('dragging');
        }, 0);
    }

    function handleJigsawDragEnd(e) {
        if (draggedPieceElement) {
            draggedPieceElement.classList.remove('dragging');
        }
        draggedPieceElement = null;
    }

    function handleDropOnJigsawSlot(e) {
        e.preventDefault(); 
        if (!draggedPieceElement) return;

        const slotElement = e.target.closest('.jigsaw-slot'); 
        if (!slotElement) return;

        const pieceId = draggedPieceElement.id;
        const slotId = slotElement.id;

        const pieceRow = parseInt(draggedPieceElement.dataset.pieceRow);
        const pieceCol = parseInt(draggedPieceElement.dataset.pieceCol);
        const slotExpectedRow = parseInt(slotElement.dataset.expectedRow);
        const slotExpectedCol = parseInt(slotElement.dataset.expectedCol);

        if (pieceRow === slotExpectedRow && pieceCol === slotExpectedCol) {
            placeJigsawPieceInSlot(draggedPieceElement, slotElement);
            
            currentJigsawState.placedPieceMap[pieceId] = slotId;
            const pieceState = currentJigsawState.pieces.find(p => p.id === pieceId);
            if (pieceState) pieceState.isPlaced = true;
            
            playerData.levelProgress[currentLevelId].placedPieces[pieceId] = slotId;
            saveLevelProgress(currentLevelId);
            
            checkJigsawWin();
        } else {
            if(jigsawMessage) jigsawMessage.textContent = "位置不對喔！再試試看。";
            if (draggedPieceElement.parentElement !== jigsawPiecesContainer) {
                 if(jigsawPiecesContainer) jigsawPiecesContainer.appendChild(draggedPieceElement); 
            }
            setTimeout(() => { if(jigsawMessage) jigsawMessage.textContent = "" }, 2000);
        }
    }
    
    function placeJigsawPieceInSlot(pieceEl, slotEl, silent = false) {
        slotEl.innerHTML = ''; 
        slotEl.appendChild(pieceEl); 
        
        pieceEl.style.position = 'relative'; 
        pieceEl.style.left = '0';
        pieceEl.style.top = '0';
        pieceEl.draggable = false; 

        if (!silent) {
            pieceEl.classList.add('placed-animation'); 
            if(jigsawMessage) jigsawMessage.textContent = "放對了！";
            setTimeout(() => {
                pieceEl.classList.remove('placed-animation');
                if(jigsawMessage) jigsawMessage.textContent = "";
             }, 1200); 
        }
    }

    function checkJigsawWin() {
        if (!currentLevelConfig || !playerData.levelProgress[currentLevelId]) return;

        const totalPiecesForLevel = currentLevelConfig.puzzlePiecesCount;
        const placedCount = Object.keys(currentJigsawState.placedPieceMap).length;
        
        updateLevelPuzzleProgressDisplay(); 

        if (placedCount === totalPiecesForLevel && totalPiecesForLevel > 0) { 
            if(jigsawMessage) jigsawMessage.textContent = `恭喜！${currentLevelConfig.name} 拼圖完成！`;
            playerData.levelProgress[currentLevelId].isPuzzleComplete = true;
            
            if (currentLevelId < GAME_LEVELS.length && currentLevelId >= playerData.maxUnlockedLevel) {
                playerData.maxUnlockedLevel = currentLevelId + 1;
                savePlayerGlobalData(); 
                populateLevelSelectScreen(); 
            }
            saveLevelProgress(currentLevelId); 
            alert(`${currentLevelConfig.name} 拼圖已完成！`);
        }
    }


    // --- Main Application Logic (主應用程式邏輯與事件監聽) ---
    function initializeUI() {
        const showRegisterLink = document.getElementById('show-register-link');
        const showLoginLink = document.getElementById('show-login-link');
        
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (loginForm) loginForm.style.display = 'none';
                if (registerForm) registerForm.style.display = 'none';
                if (forgotPasswordSection) forgotPasswordSection.style.display = 'block';
                if (loginErrorMsg) loginErrorMsg.textContent = '';
                if (registerErrorMsg) registerErrorMsg.textContent = '';
                if (resetInfoMessage) resetInfoMessage.textContent = '';
                if (resetInfoMessage) resetInfoMessage.style.color = "#e74c3c"; 
            });
        }

        if (sendResetEmailButton) {
            sendResetEmailButton.addEventListener('click', handleForgotPassword);
        }

        if (cancelResetButton) {
            cancelResetButton.addEventListener('click', (e) => {
                e.preventDefault();
                if (forgotPasswordSection) forgotPasswordSection.style.display = 'none';
                if (loginForm) loginForm.style.display = 'block'; 
                if (resetInfoMessage) resetInfoMessage.textContent = '';
            });
        }


        if (showRegisterLink) {
            showRegisterLink.addEventListener('click', (e) => {
                e.preventDefault(); 
                if (loginForm) loginForm.style.display = 'none';
                if (registerForm) registerForm.style.display = 'block';
                if (forgotPasswordSection) forgotPasswordSection.style.display = 'none'; 
                if (loginErrorMsg) loginErrorMsg.textContent = ''; 
                if (registerErrorMsg) registerErrorMsg.textContent = '';
            });
        }
        if (showLoginLink) {
            showLoginLink.addEventListener('click', (e) => {
                e.preventDefault(); 
                if (loginForm) loginForm.style.display = 'block';
                if (registerForm) registerForm.style.display = 'none';
                if (forgotPasswordSection) forgotPasswordSection.style.display = 'none'; 
                if (loginErrorMsg) loginErrorMsg.textContent = ''; 
                if (registerErrorMsg) registerErrorMsg.textContent = '';
            });
        }

        const registerButton = document.getElementById('register-button');
        if (registerButton) {
            registerButton.addEventListener('click', () => {
                const email = registerEmailInput.value.trim(); 
                const password = registerPasswordInput.value;
                const confirmPassword = registerConfirmPasswordInput.value;
                if (password !== confirmPassword) {
                    if (registerErrorMsg) registerErrorMsg.textContent = "兩次輸入的密碼不一致。";
                    return;
                }
                registerUser(email, password); 
            });
        }
        const loginButton = document.getElementById('login-button');
        if (loginButton) {
            loginButton.addEventListener('click', () => {
                loginUser(loginEmailInput.value.trim(), loginPasswordInput.value); 
            });
        }
        const guestLoginButton = document.getElementById('guest-login-button');
        if (guestLoginButton) {
            guestLoginButton.addEventListener('click', signInGuest);
        }
        if (googleLoginButton) { 
            googleLoginButton.addEventListener('click', signInWithGoogle);
        }
        if (logoutButton) {
            logoutButton.addEventListener('click', logoutUser);
        }

        const backToLevelSelectButton = document.getElementById('back-to-level-select');
        if (backToLevelSelectButton) {
            backToLevelSelectButton.addEventListener('click', () => {
                populateLevelSelectScreen(); 
                showScreen('levelSelect');
            });
        }
        const minesweeperBackButton = document.getElementById('minesweeper-back-button');
        if (minesweeperBackButton) {
            minesweeperBackButton.addEventListener('click', () => {
                currentMinesweeperGame = null; 
                updateLevelPuzzleProgressDisplay(); 
                showScreen('inLevel');
            });
        }
        const jigsawBackButton = document.getElementById('jigsaw-back-button');
        if (jigsawBackButton) {
            jigsawBackButton.addEventListener('click', () => {
                updateLevelPuzzleProgressDisplay(); 
                showScreen('inLevel');
            });
        }
        
        const playMinesweeperButton = document.getElementById('play-minesweeper-button');
        if (playMinesweeperButton) {
            playMinesweeperButton.addEventListener('click', startMinesweeperGame);
        }
        const playJigsawButton = document.getElementById('play-jigsaw-button');
        if (playJigsawButton) {
            playJigsawButton.addEventListener('click', startJigsawGame);
        }

        if (minesweeperGridElement) {
            minesweeperGridElement.addEventListener('click', (e) => {
                if (!currentMinesweeperGame || currentMinesweeperGame.gameOver) return;
                const cellEl = e.target.closest('.ms-cell');
                if (cellEl) {
                    const r = parseInt(cellEl.dataset.r);
                    const c = parseInt(cellEl.dataset.c);
                    revealMinesweeperCell(r, c); // isChording 預設為 false
                }
            });
            minesweeperGridElement.addEventListener('contextmenu', (e) => {
                e.preventDefault(); 
                if (!currentMinesweeperGame || currentMinesweeperGame.gameOver) return;
                const cellEl = e.target.closest('.ms-cell');
                if (cellEl) {
                    const r = parseInt(cellEl.dataset.r);
                    const c = parseInt(cellEl.dataset.c);
                    toggleMinesweeperFlag(r, c);
                }
            });
        }
        
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (screens.minesweeper && screens.minesweeper.classList.contains('active') && currentMinesweeperGame) {
                    renderMinesweeperBoard();
                }
                if (screens.jigsaw && screens.jigsaw.classList.contains('active') && currentJigsawState.image) {
                }
            }, 250); 
        });
    }

    function populateLevelSelectScreen() {
        if (!levelSelectButtonsContainer) return;
        levelSelectButtonsContainer.innerHTML = ''; 
        GAME_LEVELS.forEach(level => {
            const button = document.createElement('button');
            button.textContent = level.name;
            button.disabled = level.id > playerData.maxUnlockedLevel;
            if (button.disabled) {
                button.title = "完成前一關的拼圖以解鎖";
            } else {
                button.title = `開始 ${level.name}`;
            }
            button.addEventListener('click', () => loadLevel(level.id));
            levelSelectButtonsContainer.appendChild(button);
        });
    }

    function loadLevel(levelIdToLoad) {
        currentLevelId = levelIdToLoad;
        currentLevelConfig = GAME_LEVELS.find(l => l.id === levelIdToLoad);
        if (!currentLevelConfig) {
            console.error("關卡設定未找到:", levelIdToLoad);
            alert("無法載入關卡，請重試。");
            showScreen('levelSelect'); 
            return;
        }
        if(currentLevelTitle) currentLevelTitle.textContent = `${currentLevelConfig.name}`;
        updateLevelPuzzleProgressDisplay();
        showScreen('inLevel');
    }

    function updateLevelPuzzleProgressDisplay() {
        if (!currentLevelConfig || !playerData.levelProgress[currentLevelId] || !levelPuzzleProgressDisplay) {
            if (levelPuzzleProgressDisplay) levelPuzzleProgressDisplay.textContent = "拼圖進度: 數據錯誤";
            return;
        }
        const levelProgress = playerData.levelProgress[currentLevelId];
        const totalPieces = currentLevelConfig.puzzlePiecesCount;
        const ownedCount = levelProgress.ownedPieces.length;
        const placedCount = Object.keys(levelProgress.placedPieces).length;
        
        let progressText = `拼圖進度: ${placedCount} / ${ownedCount} (已擁有), 共 ${totalPieces} 塊`;
        if (levelProgress.isPuzzleComplete) {
            progressText += " - 👍 已完成！";
        }
        levelPuzzleProgressDisplay.textContent = progressText;
    }


    function startMinesweeperGame() {
        if (!currentLevelConfig) {
            console.error("[Main] 無法開始踩地雷：currentLevelConfig 未定義。");
            alert("請先選擇一個關卡。");
            return;
        }
        if (minesweeperMessage) minesweeperMessage.textContent = ''; 
        const msTitleElement = document.getElementById('minesweeper-level-title');
        if (msTitleElement) {
            msTitleElement.textContent = `踩地雷 - ${currentLevelConfig.name}`;
        }
        
        currentMinesweeperGame = createMinesweeperGame(currentLevelConfig);
        if (!currentMinesweeperGame) { 
            console.error("[Main] 踩地雷遊戲物件創建失敗。");
            return;
        }
        
        showScreen('minesweeper'); 
        setTimeout(() => {
            renderMinesweeperBoard(); 
        }, 100); 
    }

    function startJigsawGame() {
        if (!currentLevelConfig) {
            console.error("無法開始拼圖：currentLevelConfig 未定義。");
            alert("請先選擇一個關卡。");
            return;
        }
        const jigsawTitleElement = document.getElementById('jigsaw-level-title');
        if (jigsawTitleElement) {
            jigsawTitleElement.textContent = `拼圖 - ${currentLevelConfig.name}`;
        }
        setupJigsawPuzzle(); 
        showScreen('jigsaw');
    }

    // --- Firebase Auth State Change Listener (更新後) ---
    auth.onAuthStateChanged(async (user) => {
        showLoading(true);
        if (user) {
            currentUser = user;
            await loadPlayerData(user.uid, user.isAnonymous, user); 
            
            if (usernameDisplay) usernameDisplay.textContent = playerData.username; 
            if (userInfoContainer) userInfoContainer.style.display = 'flex';
            if (logoutButton) logoutButton.style.display = 'inline-block';
            
            populateLevelSelectScreen(); 
            showScreen('levelSelect'); 
            
            if (loginForm && typeof loginForm.reset === 'function') {
                loginForm.reset();
            } else if (loginForm) { 
                if (loginEmailInput) loginEmailInput.value = ''; 
                if (loginPasswordInput) loginPasswordInput.value = '';
            }

            if (registerForm && typeof registerForm.reset === 'function') {
                registerForm.reset();
            } else if (registerForm) { 
                if (registerEmailInput) registerEmailInput.value = ''; 
                if (registerPasswordInput) registerPasswordInput.value = '';
                if (registerConfirmPasswordInput) registerConfirmPasswordInput.value = '';
            }
            if (forgotPasswordSection && forgotPasswordSection.style.display !== 'none') {
                if (resetEmailInput) resetEmailInput.value = '';
                if (resetInfoMessage) resetInfoMessage.textContent = '';
                forgotPasswordSection.style.display = 'none'; 
            }


            if (loginErrorMsg) loginErrorMsg.textContent = '';
            if (registerErrorMsg) registerErrorMsg.textContent = '';

        } else {
            currentUser = null;
            playerData = { username: '', maxUnlockedLevel: 1, levelProgress: {} }; 
            if (userInfoContainer) userInfoContainer.style.display = 'none';
            if (logoutButton) logoutButton.style.display = 'none';
            if (forgotPasswordSection) forgotPasswordSection.style.display = 'none';
            if (loginForm) loginForm.style.display = 'block'; 
            if (registerForm) registerForm.style.display = 'none';
            showScreen('auth'); 
        }
        showLoading(false);
    });

    // --- 初始化遊戲 ---
    initializeUI(); 
});
