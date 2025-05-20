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
    let currentMainLevelId = null;    // 當前選擇的主關卡 ID
    let currentPlayingSubLevelIndex = -1; // 正在遊玩的踩地雷小關卡索引, -1 表示未在遊玩
    let currentMainLevelConfig = null; // 當前主關卡的設定物件
    let currentMinesweeperGame = null;
    let currentJigsawState = { image: null, pieces: [], slots: [], ownedPieceIds: [], placedPieceMap: {} };
    let playerData = {
        username: '',
        maxUnlockedLevel: 1,
        levelProgress: {} // 例如: { 1: {isPuzzleComplete:false, ownedPieces:[], placedPieces:{}, completedSubLevels: 0}, ... }
    };

    // --- UI 元素參照 ---
    const loadingIndicator = document.getElementById('loading-indicator');
    const screens = {
        auth: document.getElementById('auth-screen'),
        levelSelect: document.getElementById('level-select-screen'),
        inLevel: document.getElementById('in-level-screen'), // 現在是小關卡選擇畫面
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
    // const playMinesweeperButton = document.getElementById('play-minesweeper-button'); // 已被 sub-level-buttons-container 取代
    const subLevelButtonsContainer = document.getElementById('sub-level-buttons-container'); // 新增，用於放置小關卡按鈕
    const minesweeperGridElement = document.getElementById('minesweeper-grid');
    const minesweeperGridContainer = document.getElementById('minesweeper-grid-container');
    const minesLeftDisplay = document.getElementById('mines-left');
    const errorsMadeDisplay = document.getElementById('errors-made');
    const maxErrorsDisplay = document.getElementById('max-errors');
    const minesweeperMessage = document.getElementById('minesweeper-message');
    const jigsawFrameContainer = document.getElementById('jigsaw-frame-container');
    const jigsawPiecesContainer = document.getElementById('jigsaw-pieces-container');
    const jigsawMessage = document.getElementById('jigsaw-message');


    // --- 遊戲關卡設定 (GAME_LEVELS) ---
    const GAME_LEVELS = [
        {
            id: 1, name: "第一關",
            imagePath: "assets/img/第一關拼圖.jpg", // 請確保圖片路徑正確
            puzzlePiecesCount: 9, puzzleRows: 3, puzzleCols: 3,
            msGridSize: 10,
            msMaxErrors: 3,
            subLevelsCount: 9,
            msDensityStart: 0.08,
            msDensityEnd: 0.13
        },
        {
            id: 2, name: "第二關",
            imagePath: "assets/img/第二關拼圖.jpg", // 請確保圖片路徑正確
            puzzlePiecesCount: 16, puzzleRows: 4, puzzleCols: 4,
            msGridSize: 15,
            msMaxErrors: 4,
            subLevelsCount: 16,
            msDensityStart: 0.12,
            msDensityEnd: 0.16
        },
        {
            id: 3, name: "第三關",
            imagePath: "assets/img/第三關拼圖.jpg", // 請確保圖片路徑正確
            puzzlePiecesCount: 25, puzzleRows: 5, puzzleCols: 5,
            msGridSize: 20,
            msMaxErrors: 5,
            subLevelsCount: 25,
            msDensityStart: 0.15,
            msDensityEnd: 0.18
        },
    ];

    // --- 工具函數 ---
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
            GAME_LEVELS.forEach(level => { // 為新用戶初始化所有關卡的進度結構
                initialPlayerData.levelProgress[level.id] = {
                    isPuzzleComplete: false,
                    ownedPieces: [],
                    placedPieces: {},
                    completedSubLevels: 0
                };
            });
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
        } catch (error)
        {
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
                GAME_LEVELS.forEach(level => { // 為新用戶初始化所有關卡的進度結構
                    initialPlayerData.levelProgress[level.id] = {
                        isPuzzleComplete: false,
                        ownedPieces: [],
                        placedPieces: {},
                        completedSubLevels: 0
                    };
                });
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
            const userCredential = await auth.signInAnonymously();
            const user = userCredential.user;
            // 確保訪客也有初始化的 levelProgress
            const playerDocRef = db.collection('playerData').doc(user.uid);
            const playerDoc = await playerDocRef.get();
            if (!playerDoc.exists) {
                 const initialPlayerData = {
                    username: "訪客玩家",
                    maxUnlockedLevel: 1,
                    levelProgress: {}
                };
                GAME_LEVELS.forEach(level => {
                    initialPlayerData.levelProgress[level.id] = {
                        isPuzzleComplete: false,
                        ownedPieces: [],
                        placedPieces: {},
                        completedSubLevels: 0
                    };
                });
                await playerDocRef.set(initialPlayerData);
            }

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
                // 確保所有定義的遊戲關卡都在 playerData.levelProgress 中有記錄
                GAME_LEVELS.forEach(mainLevel => {
                    if (!playerData.levelProgress[mainLevel.id]) {
                        playerData.levelProgress[mainLevel.id] = {
                            isPuzzleComplete: false,
                            ownedPieces: [],
                            placedPieces: {},
                            completedSubLevels: 0
                        };
                    } else {
                        // 確保舊數據也有 completedSubLevels
                        if (typeof playerData.levelProgress[mainLevel.id].completedSubLevels === 'undefined') {
                            playerData.levelProgress[mainLevel.id].completedSubLevels = 0;
                        }
                         if (typeof playerData.levelProgress[mainLevel.id].ownedPieces === 'undefined') {
                            playerData.levelProgress[mainLevel.id].ownedPieces = [];
                        }
                         if (typeof playerData.levelProgress[mainLevel.id].placedPieces === 'undefined') {
                            playerData.levelProgress[mainLevel.id].placedPieces = {};
                        }
                    }
                });

            } else { // 新用戶或訪客首次（理論上訪客登入時已創建）
                playerData.username = isAnonymous ? "訪客玩家" : (authUser.displayName || (authUser.email ? authUser.email.split('@')[0] : `玩家${userId.substring(0,5)}`));
                if (!isAnonymous && authUser.email) playerData.email = authUser.email;
                playerData.maxUnlockedLevel = 1;
                playerData.levelProgress = {};

                GAME_LEVELS.forEach(mainLevel => {
                    playerData.levelProgress[mainLevel.id] = {
                        isPuzzleComplete: false,
                        ownedPieces: [],
                        placedPieces: {},
                        completedSubLevels: 0
                    };
                });

                await userDocRef.set({
                    username: playerData.username,
                    email: playerData.email || '',
                    maxUnlockedLevel: playerData.maxUnlockedLevel,
                    levelProgress: playerData.levelProgress
                });
            }

        } catch (error) {
            console.error("載入玩家數據錯誤:", error);
            alert("無法載入您的遊戲進度，請嘗試重新整理。");
            // 可以考慮登出或顯示一個更持久的錯誤訊息
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
    function getSubLevelMineCount(mainLevelCfg, subLevelIdx) {
        if (!mainLevelCfg || !mainLevelCfg.subLevelsCount || subLevelIdx < 0 || subLevelIdx >= mainLevelCfg.subLevelsCount) {
            return mainLevelCfg.msMines || 10; // Fallback
        }
        const { msGridSize, subLevelsCount, msDensityStart, msDensityEnd } = mainLevelCfg;
        let currentDensity;
        if (subLevelsCount <= 1) {
            currentDensity = msDensityStart;
        } else {
            currentDensity = msDensityStart + (msDensityEnd - msDensityStart) * (subLevelIdx / (subLevelsCount - 1));
        }
        const mineCount = Math.floor(msGridSize * msGridSize * currentDensity);
        return Math.max(1, Math.min(mineCount, msGridSize * msGridSize - 9)); // 確保至少有9個空格給第一次點擊
    }

    function createMinesweeperGame(mainLevelCfg, subLevelIdxForDisplay) {
        const gridSize = mainLevelCfg.msGridSize;
        // 地雷數量和最大錯誤次數現在由 getSubLevelMineCount 和 mainLevelCfg 決定
        const numMines = getSubLevelMineCount(mainLevelCfg, currentPlayingSubLevelIndex); // 使用正在遊玩的小關卡索引
        const maxErrorsAllowed = mainLevelCfg.msMaxErrors;

        console.log(`[Minesweeper] 準備創建小關卡 ${subLevelIdxForDisplay + 1} (主關卡 ${mainLevelCfg.id}): 格子 ${gridSize}x${gridSize}, 地雷 ${numMines}, 容錯 ${maxErrorsAllowed}`);

        if (typeof gridSize !== 'number' || typeof numMines !== 'number' || typeof maxErrorsAllowed !== 'number') {
            console.error("[Minesweeper] 無效的關卡設定:", {gridSize, numMines, maxErrorsAllowed});
            alert("無法建立踩地雷遊戲：關卡設定錯誤。");
            return null;
        }
        const board = [];
        for (let r = 0; r < gridSize; r++) {
            board[r] = [];
            for (let c = 0; c < gridSize; c++) {
                board[r][c] = { r, c, isMine: false, isRevealed: false, isFlagged: false, adjacentMines: 0 };
            }
        }

        // 地雷此時不放置，等待第一次點擊
        return {
            board,
            size: gridSize,
            numMines, // 記錄預計的地雷數
            maxErrorsAllowed,
            revealedCount: 0,
            flagsPlaced: 0,
            errorsMadeCount: 0,
            gameOver: false,
            gameWon: false,
            firstClickDone: false // 新增：標記是否已完成首次點擊
        };
    }

    function placeMinesAfterFirstClick(game, firstClickR, firstClickC) {
        const gridSize = game.size;
        const numMinesToPlace = game.numMines;
        const forbiddenCells = new Set();

        // 標記第一次點擊的格子及其周圍8格為禁止放雷區
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = firstClickR + dr;
                const nc = firstClickC + dc;
                if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
                    forbiddenCells.add(`${nr}-${nc}`);
                }
            }
        }

        let minesPlaced = 0;
        let attempts = 0; // 防止無限迴圈
        while (minesPlaced < numMinesToPlace && attempts < gridSize * gridSize * 2) {
            const r = Math.floor(Math.random() * gridSize);
            const c = Math.floor(Math.random() * gridSize);
            if (!game.board[r][c].isMine && !forbiddenCells.has(`${r}-${c}`)) {
                game.board[r][c].isMine = true;
                minesPlaced++;
            }
            attempts++;
        }
        if (minesPlaced < numMinesToPlace) {
            console.warn(`[Minesweeper] 未能放置所有預期地雷 (${numMinesToPlace})，實際放置 ${minesPlaced}。可能是安全區域過大或地雷數過多。`);
            game.numMines = minesPlaced; // 更新實際地雷數
        }


        // 計算每個格子的相鄰地雷數
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (game.board[r][c].isMine) continue;
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && game.board[nr][nc].isMine) {
                            count++;
                        }
                    }
                }
                game.board[r][c].adjacentMines = count;
            }
        }
        game.firstClickDone = true;
        console.log(`[Minesweeper] 地雷已在首次點擊後佈置。安全點: (${firstClickR}, ${firstClickC}), 實際地雷數: ${game.numMines}`);
    }


    function renderMinesweeperBoard() {
        if (!currentMinesweeperGame) {
            if(minesweeperGridElement) minesweeperGridElement.innerHTML = '錯誤：遊戲數據未載入。';
            return;
        }

        // ... (原有的捲動位置保存邏輯可以保留)
        let scrollYBeforeRender = 0;
        let minesweeperGridRectBeforeRender = null;

        if (minesweeperGridElement && minesweeperGridElement.offsetParent !== null) {
            scrollYBeforeRender = window.pageYOffset || document.documentElement.scrollTop;
            minesweeperGridRectBeforeRender = minesweeperGridElement.getBoundingClientRect();
        }


        const game = currentMinesweeperGame;
        if (!minesweeperGridElement || !minesweeperGridContainer) {
            console.error("[Minesweeper] Grid element or container not found!");
            return;
        }
        minesweeperGridElement.innerHTML = '';
        minesweeperGridElement.style.gridTemplateColumns = `repeat(${game.size}, 1fr)`;

        const containerWidth = minesweeperGridContainer.clientWidth;
        let cellSize = Math.floor(containerWidth / game.size) - 2; // 減去邊框
        cellSize = Math.max(10, Math.min(cellSize, 30)); // 設定最小和最大格子尺寸

        if (containerWidth === 0 && game.size > 0) {
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

        // ... (原有的捲動位置恢復邏輯可以保留)
        if (minesweeperGridRectBeforeRender) {
            requestAnimationFrame(() => {
                if (minesweeperGridElement && minesweeperGridElement.offsetParent !== null) {
                    const minesweeperGridRectAfterRender = minesweeperGridElement.getBoundingClientRect();
                    const diffY = minesweeperGridRectAfterRender.top - minesweeperGridRectBeforeRender.top;
                    window.scrollBy(0, diffY);
                } else {
                    window.scrollTo(0, scrollYBeforeRender);
                }
            });
        }
    }

    function revealMinesweeperCell(r, c, isChordingTrigger = false) {
        if (!currentMinesweeperGame || currentMinesweeperGame.gameOver) return;
        const game = currentMinesweeperGame;

        // 首次點擊邏輯
        if (!game.firstClickDone) {
            placeMinesAfterFirstClick(game, r, c);
            // 首次點擊後，目標格子及其周圍是安全的，直接執行揭開邏輯
            // 此處不需要再次呼叫 revealMinesweeperCell，因為 placeMinesAfterFirstClick 後，
            // (r,c) 處的 isMine 必為 false，adjacentMines 也已計算。
            // 接下來的 cell.isRevealed 判斷會繼續執行。
        }

        const cell = game.board[r][c];

        if (cell.isRevealed && !isChordingTrigger && cell.adjacentMines > 0) { // Chording (雙擊或安全點擊展開)
            let flaggedNeighbors = 0;
            const neighborsToReveal = [];
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < game.size && nc >= 0 && nc < game.size) {
                        if (game.board[nr][nc].isFlagged) {
                            flaggedNeighbors++;
                        } else if (!game.board[nr][nc].isRevealed) {
                            neighborsToReveal.push({r: nr, c: nc});
                        }
                    }
                }
            }

            if (flaggedNeighbors === cell.adjacentMines) {
                neighborsToReveal.forEach(n => revealMinesweeperCell(n.r, n.c, true)); // 遞迴揭開
            }
            if (!isChordingTrigger && neighborsToReveal.length > 0) { // 如果是 chording 的發起者且有格子被揭開
                 renderMinesweeperBoard();
                 if (!game.gameOver) checkMinesweeperWinCondition();
            }
            return; // Chording 操作後直接返回
        }

        if (cell.isRevealed || cell.isFlagged) return; // 如果格子已揭開或已插旗，則不執行任何操作

        cell.isRevealed = true;
        game.revealedCount++;

        if (cell.isMine) {
            game.errorsMadeCount++;
            if (game.errorsMadeCount >= game.maxErrorsAllowed) {
                game.gameOver = true;
                game.gameWon = false;
                if(minesweeperMessage) minesweeperMessage.textContent = "遊戲失敗！踩到太多地雷了。";
                revealAllMines(false); // 顯示所有地雷
            }
            // 如果只是踩到地雷但還沒輸，只更新錯誤計數，遊戲繼續
        } else {
            if (cell.adjacentMines === 0) { // 如果是空格子，遞迴揭開周圍的格子
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < game.size && nc >= 0 && nc < game.size) {
                            if (!game.board[nr][nc].isRevealed && !game.board[nr][nc].isFlagged) { // 只揭開未揭開且未插旗的
                                revealMinesweeperCell(nr, nc, true); // 標記為遞迴調用
                            }
                        }
                    }
                }
            }
        }
        if (!isChordingTrigger) { // 如果不是 chording 遞迴的一部分，則渲染並檢查勝利
            renderMinesweeperBoard(); // 每次有效點擊後重新渲染
            if (!game.gameOver) checkMinesweeperWinCondition(); // 檢查是否勝利
        }
    }

    function toggleMinesweeperFlag(r, c) {
        if (!currentMinesweeperGame || currentMinesweeperGame.gameOver || !currentMinesweeperGame.firstClickDone) return; // 未開始或已結束則不動作
        const game = currentMinesweeperGame;
        const cell = game.board[r][c];

        if (cell.isRevealed) return; // 已揭開的格子不能插旗

        cell.isFlagged = !cell.isFlagged;
        game.flagsPlaced += cell.isFlagged ? 1 : -1;

        renderMinesweeperBoard(); // 重新渲染以顯示旗幟變化
    }

    function checkMinesweeperWinCondition() {
        if (!currentMinesweeperGame || !currentMinesweeperGame.firstClickDone) return; // 確保遊戲已開始
        const game = currentMinesweeperGame;
        if (game.gameOver) return; // 如果遊戲已結束 (無論輸贏)，則不執行

        // 勝利條件：所有非地雷格子都被揭開，且錯誤數小於最大允許錯誤數
        if (game.revealedCount === (game.size * game.size) - game.numMines && game.errorsMadeCount < game.maxErrorsAllowed) {
            game.gameOver = true;
            game.gameWon = true;
            if(minesweeperMessage) minesweeperMessage.textContent = "恭喜！成功完成踩地雷！獲得一個拼圖碎片！";
            awardPuzzlePiece(); // 獎勵拼圖並更新進度
            revealAllMines(true); // 顯示所有地雷 (標記為勝利)

            // 勝利後自動返回
            setTimeout(() => {
                alert("拼圖碎片已獲得！按確認返回關卡畫面。");
                currentMinesweeperGame = null; // 清理當前遊戲狀態
                loadMainLevel(currentMainLevelId); // 重新載入主關卡畫面 (會更新小關卡狀態)
                showScreen('inLevel');
            }, 1000); // 延遲1秒讓玩家看到結果
        }
    }

    function revealAllMines(isWin) {
        if (!currentMinesweeperGame) return;
        const game = currentMinesweeperGame;
        game.board.forEach(row => {
            row.forEach(cell => {
                if (cell.isMine) {
                    cell.isRevealed = true; // 揭開所有地雷
                    if (isWin) cell.isFlagged = true; // 如果是勝利，則標記旗幟
                } else if (cell.isFlagged && !cell.isMine) { // 如果插錯旗
                    if (!isWin) cell.classList.add('wrong-flag'); // 可以添加樣式標記錯誤的旗幟 (需CSS配合)
                }
            });
        });
        renderMinesweeperBoard();
    }

    function updateMinesweeperInfo() {
        if (!currentMinesweeperGame) return;
        const game = currentMinesweeperGame;
        if (minesLeftDisplay) minesLeftDisplay.textContent = game.firstClickDone ? (game.numMines - game.flagsPlaced) : game.numMines;
        if (errorsMadeDisplay) errorsMadeDisplay.textContent = game.errorsMadeCount;
        if (maxErrorsDisplay) maxErrorsDisplay.textContent = game.maxErrorsAllowed;
    }

    function awardPuzzlePiece() {
        if (!currentMainLevelConfig || !playerData.levelProgress[currentMainLevelId]) {
            console.warn("無法獎勵拼圖：主關卡設定或進度未載入。");
            return;
        }

        const mainLevelProgress = playerData.levelProgress[currentMainLevelId];

        // 只有當完成的是當前應完成的下一個小關卡時，才增加 completedSubLevels
        if (currentPlayingSubLevelIndex === mainLevelProgress.completedSubLevels) {
            mainLevelProgress.completedSubLevels++;
            console.log(`主關卡 ${currentMainLevelId} 的已完成小關卡數更新為: ${mainLevelProgress.completedSubLevels}`);
        } else {
            console.log(`重玩已完成的小關卡 ${currentPlayingSubLevelIndex + 1}，不改變 completedSubLevels (${mainLevelProgress.completedSubLevels})。`);
        }


        // 獎勵拼圖碎片的邏輯不變
        if (mainLevelProgress.ownedPieces.length < currentMainLevelConfig.puzzlePiecesCount) {
            const allPieceIdsForMainLevel = [];
            for (let r = 0; r < currentMainLevelConfig.puzzleRows; r++) {
                for (let c = 0; c < currentMainLevelConfig.puzzleCols; c++) {
                    allPieceIdsForMainLevel.push(`piece_r${r}c${c}`);
                }
            }
            const unownedPieceIds = allPieceIdsForMainLevel.filter(id => !mainLevelProgress.ownedPieces.includes(id));

            if (unownedPieceIds.length > 0) {
                const randomIndex = Math.floor(Math.random() * unownedPieceIds.length);
                const newPieceId = unownedPieceIds[randomIndex];
                mainLevelProgress.ownedPieces.push(newPieceId);
                console.log(`獎勵拼圖碎片: ${newPieceId} (主關卡 ${currentMainLevelId})`);
                // alert("恭喜！獲得一個新的拼圖碎片！"); // 這個 alert 會在 checkMinesweeperWinCondition 中處理
            } else {
                console.log(`主關卡 ${currentMainLevelId} 的所有拼圖碎片均已擁有。`);
                // alert("您已擁有此主關卡的所有拼圖碎片！");
            }
        } else {
             console.log(`已擁有主關卡 ${currentMainLevelId} 的所有 ${currentMainLevelConfig.puzzlePiecesCount} 個碎片。`);
        }

        saveLevelProgress(currentMainLevelId);
        // updateInLevelScreen(); // 不再需要，由 loadMainLevel 處理刷新
        currentPlayingSubLevelIndex = -1; // 重置正在遊玩的小關卡索引
    }


    // --- Jigsaw Puzzle (拼圖遊戲邏輯) ---
    let draggedPieceElement = null;

    async function setupJigsawPuzzle() {
        if (!currentMainLevelConfig) {
            console.error("無法設定拼圖：currentMainLevelConfig 未定義。");
            return;
        }
        currentJigsawState = { image: null, pieces: [], slots: [], ownedPieceIds: [], placedPieceMap: {} };
        if(jigsawFrameContainer) jigsawFrameContainer.innerHTML = '';
        if(jigsawPiecesContainer) jigsawPiecesContainer.innerHTML = '';
        if(jigsawMessage) jigsawMessage.textContent = '';

        const levelProgress = playerData.levelProgress[currentMainLevelId];
        if (!levelProgress) {
            if(jigsawMessage) jigsawMessage.textContent = "無法載入拼圖進度。";
            return;
        }
        currentJigsawState.ownedPieceIds = [...(levelProgress.ownedPieces || [])]; // 確保 ownedPieces 存在
        currentJigsawState.placedPieceMap = {...(levelProgress.placedPieces || {})}; // 確保 placedPieces 存在

        const img = new Image();
        img.src = currentMainLevelConfig.imagePath;

        showLoading(true);
        img.onload = () => {
            currentJigsawState.image = img;
            const naturalPieceWidth = img.naturalWidth / currentMainLevelConfig.puzzleCols;
            const naturalPieceHeight = img.naturalHeight / currentMainLevelConfig.puzzleRows;

            const frameContainerMaxWidth = Math.min(450, window.innerWidth * 0.8);
            const scale = frameContainerMaxWidth / img.naturalWidth;
            const displayPieceWidth = naturalPieceWidth * scale;
            const displayPieceHeight = naturalPieceHeight * scale;

            jigsawFrameContainer.style.gridTemplateColumns = `repeat(${currentMainLevelConfig.puzzleCols}, ${displayPieceWidth}px)`;
            jigsawFrameContainer.style.gridTemplateRows = `repeat(${currentMainLevelConfig.puzzleRows}, ${displayPieceHeight}px)`;
            jigsawFrameContainer.style.width = `${currentMainLevelConfig.puzzleCols * displayPieceWidth}px`;
            jigsawFrameContainer.style.height = `${currentMainLevelConfig.puzzleRows * displayPieceHeight}px`;

            for (let r = 0; r < currentMainLevelConfig.puzzleRows; r++) {
                for (let c = 0; c < currentMainLevelConfig.puzzleCols; c++) {
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
                            placeJigsawPieceInSlot(pieceCanvas, slotEl, true); // silent = true
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
            if(jigsawMessage) jigsawMessage.textContent = "無法載入拼圖圖片: " + currentMainLevelConfig.imagePath;
            console.error("拼圖圖片載入失敗:", currentMainLevelConfig.imagePath);
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

            playerData.levelProgress[currentMainLevelId].placedPieces[pieceId] = slotId;
            saveLevelProgress(currentMainLevelId);

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
        if (!currentMainLevelConfig || !playerData.levelProgress[currentMainLevelId]) return;

        const totalPiecesForLevel = currentMainLevelConfig.puzzlePiecesCount;
        const placedCount = Object.keys(currentJigsawState.placedPieceMap).length;

        updateLevelPuzzleProgressDisplay(); // 更新拼圖進度顯示

        if (placedCount === totalPiecesForLevel && totalPiecesForLevel > 0) {
            if(jigsawMessage) jigsawMessage.textContent = `恭喜！${currentMainLevelConfig.name} 拼圖完成！`;
            playerData.levelProgress[currentMainLevelId].isPuzzleComplete = true;

            if (currentMainLevelId < GAME_LEVELS.length && currentMainLevelId >= playerData.maxUnlockedLevel) {
                playerData.maxUnlockedLevel = currentMainLevelId + 1;
                savePlayerGlobalData();
                populateLevelSelectScreen(); // 更新主關卡選擇畫面 (解鎖下一關)
            }
            saveLevelProgress(currentMainLevelId);
            alert(`${currentMainLevelConfig.name} 拼圖已完成！`);
        }
    }


    // --- Main Application Logic (主應用程式邏輯與事件監聽) ---
    let pressTimer = null;
    let isLongPress = false;
    const LONG_PRESS_DURATION = 500;

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
                currentMinesweeperGame = null; // 清理遊戲狀態
                currentPlayingSubLevelIndex = -1; // 重置
                loadMainLevel(currentMainLevelId); // 返回並刷新小關卡選擇畫面
                showScreen('inLevel');
            });
        }
        const jigsawBackButton = document.getElementById('jigsaw-back-button');
        if (jigsawBackButton) {
            jigsawBackButton.addEventListener('click', () => {
                loadMainLevel(currentMainLevelId); // 返回並刷新小關卡選擇畫面
                showScreen('inLevel');
            });
        }

        // playMinesweeperButton 的事件監聽器已移除，由小關卡按鈕處理

        const playJigsawButton = document.getElementById('play-jigsaw-button');
        if (playJigsawButton) {
            playJigsawButton.addEventListener('click', startJigsawGame);
        }

        if (minesweeperGridElement) {
            minesweeperGridElement.addEventListener('click', (e) => {
                if (isLongPress) { // 如果是長按觸發的，則忽略此次點擊
                    isLongPress = false;
                    return;
                }
                if (!currentMinesweeperGame || currentMinesweeperGame.gameOver) return;
                const cellEl = e.target.closest('.ms-cell');
                if (cellEl) {
                    const r = parseInt(cellEl.dataset.r);
                    const c = parseInt(cellEl.dataset.c);
                    revealMinesweeperCell(r, c);
                }
            });

            minesweeperGridElement.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!currentMinesweeperGame || currentMinesweeperGame.gameOver || !currentMinesweeperGame.firstClickDone) return;
                const cellEl = e.target.closest('.ms-cell');
                if (cellEl) {
                    const r = parseInt(cellEl.dataset.r);
                    const c = parseInt(cellEl.dataset.c);
                    toggleMinesweeperFlag(r, c);
                }
            });

            // 長按/觸控插旗邏輯
            minesweeperGridElement.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // 只處理左鍵
                const cellEl = e.target.closest('.ms-cell');
                if (cellEl && currentMinesweeperGame && !currentMinesweeperGame.gameOver && currentMinesweeperGame.firstClickDone) {
                    isLongPress = false; // 重置長按標記
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        const r = parseInt(cellEl.dataset.r);
                        const c = parseInt(cellEl.dataset.c);
                        toggleMinesweeperFlag(r, c);
                    }, LONG_PRESS_DURATION);
                }
            });
            minesweeperGridElement.addEventListener('mouseup', () => {
                clearTimeout(pressTimer);
            });
            minesweeperGridElement.addEventListener('mouseleave', () => { // 滑鼠移出格子也取消計時
                clearTimeout(pressTimer);
            });

            // 觸控事件
            minesweeperGridElement.addEventListener('touchstart', (e) => {
                // e.preventDefault(); // 可能影響滾動，根據需要決定是否保留
                const cellEl = e.target.closest('.ms-cell');
                if (cellEl && currentMinesweeperGame && !currentMinesweeperGame.gameOver && currentMinesweeperGame.firstClickDone) {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        const r = parseInt(cellEl.dataset.r);
                        const c = parseInt(cellEl.dataset.c);
                        toggleMinesweeperFlag(r, c);
                        if (navigator.vibrate) navigator.vibrate(50); // 震動回饋
                    }, LONG_PRESS_DURATION);
                }
            }, { passive: true }); // passive: true 改善滾動性能

            minesweeperGridElement.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
            });
            minesweeperGridElement.addEventListener('touchmove', () => { // 觸控移動時取消長按
                clearTimeout(pressTimer);
                isLongPress = false; // 確保移動後不會觸發之前的點擊事件為長按
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
                    // 拼圖的響應式調整，如果需要的話
                    // 目前拼圖的尺寸是在 setupJigsawPuzzle 時根據視窗寬度計算的，
                    // 如果希望在 resize 時也動態調整，需要重新呼叫部分 setup 或重繪邏輯
                    // 暫時先不處理，因為拼圖通常不需要像踩地雷那樣頻繁重繪格子大小
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
            button.addEventListener('click', () => loadMainLevel(level.id));
            levelSelectButtonsContainer.appendChild(button);
        });
    }

    function loadMainLevel(mainLevelIdToLoad) {
        currentMainLevelId = mainLevelIdToLoad;
        currentMainLevelConfig = GAME_LEVELS.find(l => l.id === mainLevelIdToLoad);
        if (!currentMainLevelConfig) {
            console.error("主關卡設定未找到:", mainLevelIdToLoad);
            alert("無法載入關卡，請重試。");
            showScreen('levelSelect');
            return;
        }
        // currentPlayingSubLevelIndex 在此處不需要設定，會在選擇小關卡時設定

        if(currentLevelTitle) currentLevelTitle.textContent = `${currentMainLevelConfig.name}`;
        populateSubLevelButtons(); // 新增：填充小關卡按鈕
        updateLevelPuzzleProgressDisplay(); // 更新拼圖進度顯示
        showScreen('inLevel'); // 'inLevel' 現在是小關卡選擇畫面
    }

    function populateSubLevelButtons() {
        if (!subLevelButtonsContainer || !currentMainLevelConfig || !playerData.levelProgress[currentMainLevelId]) {
            if (subLevelButtonsContainer) subLevelButtonsContainer.innerHTML = '小關卡載入錯誤。';
            else console.error("subLevelButtonsContainer 未找到或關卡數據不完整");
            return;
        }
        subLevelButtonsContainer.innerHTML = ''; // 清空舊按鈕

        const mainLevelProgress = playerData.levelProgress[currentMainLevelId];
        const completedSubLevelsCount = mainLevelProgress.completedSubLevels || 0;

        for (let i = 0; i < currentMainLevelConfig.subLevelsCount; i++) {
            const subLevelButton = document.createElement('button');
            subLevelButton.textContent = `小關卡 ${i + 1}`;
            subLevelButton.classList.add('sub-level-button'); // 可以為小關卡按鈕添加特定樣式

            if (i <= completedSubLevelsCount) { // 解鎖條件：索引小於等於已完成數
                subLevelButton.disabled = false;
                subLevelButton.title = `開始 小關卡 ${i + 1}`;
                subLevelButton.addEventListener('click', () => startMinesweeperForSubLevel(i));
                if (i < completedSubLevelsCount) { // 如果是已完成的小關卡
                    subLevelButton.classList.add('completed'); // 添加 'completed' class (需CSS配合)
                    subLevelButton.textContent += " (已完成)";
                }
            } else {
                subLevelButton.disabled = true;
                subLevelButton.title = "需先完成前面的小關卡";
            }
            subLevelButtonsContainer.appendChild(subLevelButton);
        }
    }

    function startMinesweeperForSubLevel(subLevelIndexToPlay) {
        if (!currentMainLevelConfig) {
            console.error("[Main] 無法開始踩地雷：主關卡設定未定義。");
            alert("請先選擇一個主關卡。");
            return;
        }
        currentPlayingSubLevelIndex = subLevelIndexToPlay; // 設定正在遊玩的小關卡索引

        if (minesweeperMessage) minesweeperMessage.textContent = '';
        const msTitleElement = document.getElementById('minesweeper-level-title');
        if (msTitleElement) {
            msTitleElement.textContent = `踩地雷 - ${currentMainLevelConfig.name} (小關卡 ${currentPlayingSubLevelIndex + 1})`;
        }

        currentMinesweeperGame = createMinesweeperGame(currentMainLevelConfig, currentPlayingSubLevelIndex); // 傳遞顯示用索引
        if (!currentMinesweeperGame) {
            console.error("[Main] 踩地雷遊戲物件創建失敗。");
            currentPlayingSubLevelIndex = -1; // 重置
            return;
        }

        showScreen('minesweeper');
        // 延遲渲染以確保容器尺寸已確定
        setTimeout(() => {
            renderMinesweeperBoard();
        }, 100);
    }


    function updateLevelPuzzleProgressDisplay() {
        if (!currentMainLevelConfig || !playerData.levelProgress[currentMainLevelId] || !levelPuzzleProgressDisplay) {
            if (levelPuzzleProgressDisplay) levelPuzzleProgressDisplay.textContent = "拼圖進度: 數據錯誤";
            return;
        }
        const mainLevelProgress = playerData.levelProgress[currentMainLevelId];
        const totalPieces = currentMainLevelConfig.puzzlePiecesCount;
        const ownedCount = (mainLevelProgress.ownedPieces || []).length;
        const placedCount = Object.keys(mainLevelProgress.placedPieces || {}).length;

        let progressText = `拼圖: ${placedCount} / ${ownedCount} (已擁有), 共 ${totalPieces} 塊。`;
        // 小關卡進度顯示現在由 populateSubLevelButtons 中的按鈕狀態體現
        // progressText += ` 小關卡進度: ${mainLevelProgress.completedSubLevels} / ${currentMainLevelConfig.subLevelsCount}`;

        if (mainLevelProgress.isPuzzleComplete) {
            progressText += " - 👍 拼圖已完成！";
        }
        levelPuzzleProgressDisplay.textContent = progressText;
    }


    function startJigsawGame() {
        if (!currentMainLevelConfig) {
            console.error("無法開始拼圖：currentMainLevelConfig 未定義。");
            alert("請先選擇一個主關卡。");
            return;
        }
        const jigsawTitleElement = document.getElementById('jigsaw-level-title');
        if (jigsawTitleElement) {
            jigsawTitleElement.textContent = `拼圖 - ${currentMainLevelConfig.name}`;
        }
        setupJigsawPuzzle();
        showScreen('jigsaw');
    }

    // --- Firebase Auth State Change Listener ---
    if (auth) {
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

                // 清理表單
                if (loginForm && typeof loginForm.reset === 'function') { loginForm.reset(); }
                else if (loginForm) {
                    if (loginEmailInput) loginEmailInput.value = '';
                    if (loginPasswordInput) loginPasswordInput.value = '';
                }
                if (registerForm && typeof registerForm.reset === 'function') { registerForm.reset(); }
                else if (registerForm) {
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
                 GAME_LEVELS.forEach(level => { // 確保登出後 playerData 也有完整結構
                    playerData.levelProgress[level.id] = {
                        isPuzzleComplete: false,
                        ownedPieces: [],
                        placedPieces: {},
                        completedSubLevels: 0
                    };
                });
                if (userInfoContainer) userInfoContainer.style.display = 'none';
                if (logoutButton) logoutButton.style.display = 'none';
                if (forgotPasswordSection) forgotPasswordSection.style.display = 'none';
                if (loginForm) loginForm.style.display = 'block';
                if (registerForm) registerForm.style.display = 'none';
                showScreen('auth');
            }
            showLoading(false);
        });
    } else {
        console.error("Auth 物件未初始化，無法設定 onAuthStateChanged 監聽器。");
        alert("遊戲驗證服務啟動失敗，請刷新頁面或稍後再試。");
        showScreen('auth');
        showLoading(false);
    }


    // --- 初始化遊戲 ---
    initializeUI();
});
