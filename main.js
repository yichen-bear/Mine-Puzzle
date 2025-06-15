// 等待 DOM 完全載入後執行
document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase 初始化 ---
    if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
        console.error("Firebase SDK 或 firebaseConfig 未定義。");
        console.error("遊戲核心組件載入失敗，請檢查您的 HTML 設定。");
        // 可以在此處向使用者顯示一個更友善的錯誤訊息
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = '<h1>糟糕！遊戲載入失敗</h1><p>很抱歉，遊戲的核心服務無法啟動。請檢查您的網路連線，或稍後再試。如果問題持續發生，請聯繫網站管理員。</p>';
        }
        return;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
    } catch (e) {
        console.error("Firebase 初始化錯誤:", e);
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = '<h1>糟糕！初始化錯誤</h1><p>無法連接到遊戲服務。請檢查您的防火牆或網路設定，並重新整理頁面。</p>';
        }
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- 全域狀態與設定 ---
    let currentUser = null;
    let isNewLogin = false; // 用於判斷是否為新登入的旗標
    let currentMainLevelId = null; // 當前活動的主關卡ID
    let currentPlayingSubLevelIndex = -1; // 當前正在遊玩的踩地雷小關卡索引
    let currentMainLevelConfig = null; // 當前活動的主關卡配置物件
    let currentMinesweeperGame = null;
    let currentJigsawState = { image: null, pieces: [], slots: [], ownedPieceIds: [], placedPieceMap: {} };
    let playerData = {
        username: '',
        maxUnlockedLevel: 1,
        hasSeenMinesweeperTutorial: false, // **新增：追蹤是否看過踩地雷教學**
        levelProgress: {}
    };
    let hintModeActive = false; // 新增：提示模式是否激活
    let hintsUsedInCurrentSubLevel = 0; // 新增：當前小關卡已使用的提示次數

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
    const subLevelButtonsContainer = document.getElementById('sub-level-buttons-container');
    const minesweeperGridElement = document.getElementById('minesweeper-grid');
    const minesweeperGridContainer = document.getElementById('minesweeper-grid-container');
    const minesLeftDisplay = document.getElementById('mines-left');
    const errorsMadeDisplay = document.getElementById('errors-made');
    const maxErrorsDisplay = document.getElementById('max-errors');
    const hintsLeftDisplay = document.getElementById('hints-left');
    const minesweeperMessage = document.getElementById('minesweeper-message');
    const jigsawFrameContainer = document.getElementById('jigsaw-frame-container');
    const jigsawPiecesContainer = document.getElementById('jigsaw-pieces-container');
    const jigsawMessage = document.getElementById('jigsaw-message');
    const playJigsawButton = document.getElementById('play-jigsaw-button');
    const prevLevelButton = document.getElementById('prev-level-button');
    const nextLevelButton = document.getElementById('next-level-button');
    
    // 遊戲說明 Modal 參照
    const instructionsModal = document.getElementById('instructions-modal');
    const instructionsOkButton = document.getElementById('instructions-ok-button');

    const tutorialQueryModal = document.getElementById('minesweeper-tutorial-query-modal');
    const tutorialQueryYesButton = document.getElementById('tutorial-query-yes-button');
    const tutorialQueryNoButton = document.getElementById('tutorial-query-no-button');
    
    // **新增：踩地雷教學 Modal 參照**
    const minesweeperTutorialModal = document.getElementById('minesweeper-tutorial-modal');
    const tutorialSkipButton = document.getElementById('tutorial-skip-button');
    const tutorialStartButton = document.getElementById('tutorial-start-button');

    // 其他 Modal 參照
    const replayConfirmModal = document.getElementById('replay-confirm-modal');
    const replayConfirmYesButton = document.getElementById('replay-confirm-yes');
    const replayConfirmNoButton = document.getElementById('replay-confirm-no');
    const customAlertModal = document.getElementById('custom-alert-modal');
    const customAlertMessage = document.getElementById('custom-alert-message');
    const customAlertOkButton = document.getElementById('custom-alert-ok');
    const completionImageModal = document.getElementById('completion-image-modal');
    const completionImageDisplay = document.getElementById('completion-image-display');
    const completionImageOkButton = document.getElementById('completion-image-ok-button');
    const imageToggleModal = document.getElementById('image-toggle-modal');
    const toggleImageDisplay = document.getElementById('toggle-image-display');
    const toggleImageCaption = document.getElementById('toggle-image-caption');
    const toggleImagePrevButton = document.getElementById('toggle-image-prev');
    const toggleImageNextButton = document.getElementById('toggle-image-next');
    const toggleImageCloseButton = document.getElementById('toggle-image-close-button');
    const showGameRulesButton = document.getElementById('show-game-rules-button');
    const showMinesweeperRulesButton = document.getElementById('show-minesweeper-rules-button');
    const hintConfirmModal = document.getElementById('hint-confirm-modal');
    const hintConfirmYesButton = document.getElementById('hint-confirm-yes');
    const hintConfirmNoButton = document.getElementById('hint-confirm-no');
    const hintRemainingCount = document.getElementById('hint-remaining-count');

    // --- 遊戲關卡設定 (GAME_LEVELS) ---
    const GAME_LEVELS = [
        {
            id: 1, name: "第一關",
            imagePath: "assets/img/第一關拼圖.jpg",
            completionImagePath: "assets/img/good1.png",
            puzzlePiecesCount: 9, puzzleRows: 3, puzzleCols: 3,
            msGridSize: 10,
            msMaxErrors: 2,
            subLevelsCount: 9,
            msDensityStart: 0.08,
            msDensityEnd: 0.13,
            maxHints: 1 // 新增：第一關提示次數
        },
        {
            id: 2, name: "第二關",
            imagePath: "assets/img/第二關拼圖.jpg",
            completionImagePath: "assets/img/good2-1.png",
            puzzlePiecesCount: 16, puzzleRows: 4, puzzleCols: 4,
            msGridSize: 15,
            msMaxErrors: 3,
            subLevelsCount: 16,
            msDensityStart: 0.12,
            msDensityEnd: 0.16,
            maxHints: 2 // 新增：第二關提示次數
        },
        {
            id: 3, name: "第三關",
            imagePath: "assets/img/第三關拼圖.jpg",
            completionImagePath: "assets/img/good3.png",
            puzzlePiecesCount: 25, puzzleRows: 5, puzzleCols: 5,
            msGridSize: 20,
            msMaxErrors: 4,
            subLevelsCount: 25,
            msDensityStart: 0.15,
            msDensityEnd: 0.18,
            maxHints: 3 // 新增：第三關提示次數
        },
    ];

    // --- 工具函數 ---
    function showScreen(screenId) {
        console.log(`[showScreen] Changing to screen: ${screenId}. Current level ID: ${currentMainLevelId}, Config: ${currentMainLevelConfig ? currentMainLevelConfig.id : null}`);
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

    // --- Custom Modal Functions ---
    let currentReplayYesHandler = null;
    let currentReplayNoHandler = null;
    let currentCustomAlertOkHandler = null;
    let currentCompletionImageOkHandler = null;
    let currentImageToggleCloseHandler = null;
    let currentImageTogglePrevHandler = null;
    let currentImageToggleNextHandler = null;
    let isShowingPuzzleInToggleModal = true;
    let currentInstructionsOkHandler = null;
    let currentTutorialQueryYesHandler = null; 
    let currentTutorialQueryNoHandler = null;
    let currentFullTutorialCloseHandler = null;
    let currentHintConfirmYesHandler = null;
    let currentHintConfirmNoHandler = null;

    // **新增：顯示遊戲說明的 Modal 函數**
    function showInstructionsModal(callback) {
        if (currentInstructionsOkHandler) {
            instructionsOkButton.removeEventListener('click', currentInstructionsOkHandler);
        }
        currentInstructionsOkHandler = () => {
            instructionsModal.classList.remove('active'); // 先關閉自己
            if (callback) callback(); // 再執行後續動作
        };
        instructionsModal.classList.add('active');
        instructionsOkButton.addEventListener('click', currentInstructionsOkHandler, { once: true });
    }

    function showTutorialQueryModal(finalCallback) {
        const handleChoice = (needsTutorial) => {
            tutorialQueryModal.classList.remove('active');
            playerData.hasSeenMinesweeperTutorial = true; // 無論選哪個，都標記為已處理過
            savePlayerGlobalData();
            
            // 移除監聽器
            tutorialQueryYesButton.removeEventListener('click', yesHandler);
            tutorialQueryNoButton.removeEventListener('click', noHandler);
            
            if (needsTutorial) {
                showMinesweeperTutorialModal(finalCallback);
            } else {
                showCustomAlert("好的，祝您遊戲愉快！", finalCallback);
            }
        };

        const yesHandler = () => handleChoice(false);
        const noHandler = () => handleChoice(true);

        tutorialQueryModal.classList.add('active');
        tutorialQueryYesButton.addEventListener('click', yesHandler);
        tutorialQueryNoButton.addEventListener('click', noHandler);
    }
    
    // **新增：顯示踩地雷教學的 Modal 函數**
    function showMinesweeperTutorialModal(callback) {
        if (currentFullTutorialCloseHandler) {
            tutorialStartButton.removeEventListener('click', currentFullTutorialCloseHandler);
        }
        currentFullTutorialCloseHandler = () => {
            minesweeperTutorialModal.classList.remove('active');
            if (callback) callback();
        };
        minesweeperTutorialModal.classList.add('active');
        tutorialStartButton.addEventListener('click', currentFullTutorialCloseHandler, { once: true });
    }

    function showReplayConfirmDialog(callback) {
        console.log('[showReplayConfirmDialog] replayConfirmModal:', replayConfirmModal, 'YesBtn:', replayConfirmYesButton, 'NoBtn:', replayConfirmNoButton);
        if (replayConfirmModal && replayConfirmYesButton && replayConfirmNoButton) {
            const modalButtonsContainer = replayConfirmModal.querySelector('.modal-buttons');
            if (replayConfirmYesButton.parentNode !== modalButtonsContainer && modalButtonsContainer) {
                console.warn("[showReplayConfirmDialog] Yes button detached, re-appending.");
                modalButtonsContainer.appendChild(replayConfirmYesButton);
            }
            if (replayConfirmNoButton.parentNode !== modalButtonsContainer && modalButtonsContainer) {
                console.warn("[showReplayConfirmDialog] No button detached, re-appending.");
                modalButtonsContainer.appendChild(replayConfirmNoButton);
            }

            replayConfirmModal.classList.add('active');
            if (currentReplayYesHandler) replayConfirmYesButton.removeEventListener('click', currentReplayYesHandler);
            if (currentReplayNoHandler) replayConfirmNoButton.removeEventListener('click', currentReplayNoHandler);

            currentReplayYesHandler = () => {
                replayConfirmModal.classList.remove('active');
                callback(true);
            };
            currentReplayNoHandler = () => {
                replayConfirmModal.classList.remove('active');
                callback(false);
            };
            replayConfirmYesButton.addEventListener('click', currentReplayYesHandler);
            replayConfirmNoButton.addEventListener('click', currentReplayNoHandler);
        } else {
            console.error("重玩確認 Modal 的某些元素未找到!", /*...*/);
            const confirmed = confirm("您確定要重玩嗎？（自訂視窗載入失敗）");
            callback(confirmed);
        }
    }

    function showCustomAlert(message, callback) {
        console.log('[showCustomAlert] message:', message, 'OKBtn:', customAlertOkButton);
        if (customAlertModal && customAlertMessage && customAlertOkButton) {
            const modalButtonsContainer = customAlertModal.querySelector('.modal-buttons');
            if (customAlertOkButton.parentNode !== modalButtonsContainer && modalButtonsContainer) {
                console.warn("[showCustomAlert] OK button detached, re-appending.");
                modalButtonsContainer.appendChild(customAlertOkButton);
            }

            customAlertMessage.textContent = message;
            customAlertModal.classList.add('active');
            if (currentCustomAlertOkHandler) customAlertOkButton.removeEventListener('click', currentCustomAlertOkHandler);

            currentCustomAlertOkHandler = () => {
                customAlertModal.classList.remove('active');
                if (callback) callback();
            };
            customAlertOkButton.addEventListener('click', currentCustomAlertOkHandler);
        } else {
            console.error("自訂提示 Modal 的某些元素未找到!", /*...*/);
            alert(message + " (Custom alert failed)");
            if (callback) callback();
        }
    }

    function showCompletionImageModal(imagePath, callback) {
        console.log('[showCompletionImageModal] Image path:', imagePath);
        if (completionImageModal && completionImageDisplay && completionImageOkButton) {
            const modalButtonsContainer = completionImageModal.querySelector('.modal-buttons');
            if (completionImageOkButton.parentNode !== modalButtonsContainer && modalButtonsContainer) {
                console.warn("[showCompletionImageModal] OK button detached, re-appending.");
                modalButtonsContainer.appendChild(completionImageOkButton);
            }

            completionImageDisplay.src = imagePath;
            completionImageDisplay.alt = "恭喜通關！";
            completionImageDisplay.onerror = () => {
                console.error("載入通關圖片失敗:", imagePath);
                completionImageDisplay.alt = "圖片載入失敗";
            };
            completionImageModal.classList.add('active');

            if (currentCompletionImageOkHandler) {
                completionImageOkButton.removeEventListener('click', currentCompletionImageOkHandler);
            }

            currentCompletionImageOkHandler = () => {
                completionImageModal.classList.remove('active');
                completionImageDisplay.src = "";
                if (callback) callback();
            };
            completionImageOkButton.addEventListener('click', currentCompletionImageOkHandler);
        } else {
            console.error("通關圖片 Modal 的某些元素未找到!", completionImageModal, completionImageDisplay, completionImageOkButton);
            if (callback) callback();
        }
    }

    function showImageToggleModal(puzzleImagePath, badgeImagePath, callback) {
        console.log('[showImageToggleModal] Puzzle Img:', puzzleImagePath, 'Badge Img:', badgeImagePath);
        if (imageToggleModal && toggleImageDisplay && toggleImageCaption && toggleImagePrevButton && toggleImageNextButton && toggleImageCloseButton) {

            const modalButtonsContainer = imageToggleModal.querySelector('.modal-buttons');
            if (toggleImageCloseButton.parentNode !== modalButtonsContainer && modalButtonsContainer) {
                console.warn("[showImageToggleModal] Close button detached, re-appending.");
                modalButtonsContainer.appendChild(toggleImageCloseButton);
            }
            const contentContainer = imageToggleModal.querySelector('.modal-content');
            if (toggleImagePrevButton.parentNode !== contentContainer && contentContainer) {
                console.warn("[showImageToggleModal] Prev button detached, re-appending to content.");
                contentContainer.appendChild(toggleImagePrevButton);
            }
            if (toggleImageNextButton.parentNode !== contentContainer && contentContainer) {
                console.warn("[showImageToggleModal] Next button detached, re-appending to content.");
                contentContainer.appendChild(toggleImageNextButton);
            }

            isShowingPuzzleInToggleModal = true;
            toggleImageDisplay.src = puzzleImagePath;
            toggleImageDisplay.alt = "已完成的拼圖";
            toggleImageCaption.textContent = "完整拼圖 🧩";
            toggleImageDisplay.onerror = () => {
                console.error("載入拼圖圖片失敗:", puzzleImagePath);
                toggleImageDisplay.alt = "拼圖圖片載入失敗";
                toggleImageCaption.textContent = "圖片載入失敗";
            };

            imageToggleModal.classList.add('active');

            if (currentImageToggleCloseHandler) toggleImageCloseButton.removeEventListener('click', currentImageToggleCloseHandler);
            if (currentImageTogglePrevHandler) toggleImagePrevButton.removeEventListener('click', currentImageTogglePrevHandler);
            if (currentImageToggleNextHandler) toggleImageNextButton.removeEventListener('click', currentImageToggleNextHandler);

            currentImageToggleCloseHandler = () => {
                imageToggleModal.classList.remove('active');
                toggleImageDisplay.src = "";
                toggleImageCaption.textContent = "";
                if (callback) callback();
            };

            const switchImage = () => {
                isShowingPuzzleInToggleModal = !isShowingPuzzleInToggleModal;
                if (isShowingPuzzleInToggleModal) {
                    toggleImageDisplay.src = puzzleImagePath;
                    toggleImageDisplay.alt = "已完成的拼圖";
                    toggleImageCaption.textContent = "完整拼圖 🧩";
                    toggleImageDisplay.onerror = () => { console.error("載入拼圖圖片失敗:", puzzleImagePath); toggleImageDisplay.alt = "拼圖圖片載入失敗"; toggleImageCaption.textContent = "圖片載入失敗"; };
                } else {
                    if (badgeImagePath) {
                        toggleImageDisplay.src = badgeImagePath;
                        toggleImageDisplay.alt = "好棒棒徽章";
                        toggleImageCaption.textContent = "好棒棒徽章 ♥";
                        toggleImageDisplay.onerror = () => { console.error("載入徽章圖片失敗:", badgeImagePath); toggleImageDisplay.alt = "徽章圖片載入失敗"; toggleImageCaption.textContent = "圖片載入失敗"; };
                    } else {
                        isShowingPuzzleInToggleModal = true;
                        toggleImageCaption.textContent = "完整拼圖 🧩 (徽章缺失)";
                        console.warn("徽章圖片路徑未提供，無法切換。");
                    }
                }
            };

            currentImageTogglePrevHandler = switchImage;
            currentImageToggleNextHandler = switchImage;

            toggleImageCloseButton.addEventListener('click', currentImageToggleCloseHandler);
            toggleImagePrevButton.addEventListener('click', currentImageTogglePrevHandler);
            toggleImageNextButton.addEventListener('click', currentImageToggleNextHandler);

        } else {
            console.error("圖片切換 Modal 的某些元素未找到!", imageToggleModal, toggleImageDisplay, toggleImageCaption, toggleImagePrevButton, toggleImageNextButton, toggleImageCloseButton);
            if (callback) callback();
        }
    }

    // 新增：顯示提示確認 Modal 的函數
    function showHintConfirmModal(callback) {
        if (hintConfirmModal && hintConfirmYesButton && hintConfirmNoButton) {
            const modalButtonsContainer = hintConfirmModal.querySelector('.modal-buttons');
            if (hintConfirmYesButton.parentNode !== modalButtonsContainer && modalButtonsContainer) {
                console.warn("[showHintConfirmModal] Yes button detached, re-appending.");
                modalButtonsContainer.appendChild(hintConfirmYesButton);
            }
            if (hintConfirmNoButton.parentNode !== modalButtonsContainer && modalButtonsContainer) {
                console.warn("[showHintConfirmModal] No button detached, re-appending.");
                modalButtonsContainer.appendChild(hintConfirmNoButton);
            }

            // 更新剩餘提示次數顯示
            const remainingHints = currentMainLevelConfig.maxHints - hintsUsedInCurrentSubLevel;
            hintRemainingCount.textContent = remainingHints;

            hintConfirmModal.classList.add('active');
            if (currentHintConfirmYesHandler) hintConfirmYesButton.removeEventListener('click', currentHintConfirmYesHandler);
            if (currentHintConfirmNoHandler) hintConfirmNoButton.removeEventListener('click', currentHintConfirmNoHandler);

            currentHintConfirmYesHandler = () => {
                hintConfirmModal.classList.remove('active');
                callback(true);
            };
            currentHintConfirmNoHandler = () => {
                hintConfirmModal.classList.remove('active');
                callback(false);
            };
            hintConfirmYesButton.addEventListener('click', currentHintConfirmYesHandler);
            hintConfirmNoButton.addEventListener('click', currentHintConfirmNoHandler);
        } else {
            console.error("提示確認 Modal 的某些元素未找到!");
            const confirmed = confirm("您確定要使用提示嗎？（自訂視窗載入失敗）");
            callback(confirmed);
        }
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
        
        isNewLogin = true;
        showLoading(true);
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            const defaultUsername = email.split('@')[0] || `玩家${user.uid.substring(0, 5)}`;

            const initialPlayerData = {
                username: defaultUsername,
                email: user.email,
                maxUnlockedLevel: 1,
                hasSeenMinesweeperTutorial: false, // **新增**
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
            await db.collection('playerData').doc(user.uid).set(initialPlayerData);
        } catch (error) {
            isNewLogin = false;
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
        isNewLogin = true;
        showLoading(true);
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            isNewLogin = false;
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
        isNewLogin = true;
        showLoading(true);
        try {
            const result = await auth.signInWithPopup(provider);
            const user = result.user;
            const playerDocRef = db.collection('playerData').doc(user.uid);
            const playerDoc = await playerDocRef.get();

            if (!playerDoc.exists) {
                const initialPlayerData = {
                    username: user.displayName || user.email.split('@')[0] || `玩家${user.uid.substring(0, 5)}`,
                    email: user.email,
                    maxUnlockedLevel: 1,
                    hasSeenMinesweeperTutorial: false, // **新增**
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
            isNewLogin = false;
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
        isNewLogin = true;
        showLoading(true);
        try {
            const userCredential = await auth.signInAnonymously();
            const user = userCredential.user;
            const playerDocRef = db.collection('playerData').doc(user.uid);
            const playerDoc = await playerDocRef.get();
            if (!playerDoc.exists) {
                const initialPlayerData = {
                    username: "訪客玩家",
                    maxUnlockedLevel: 1,
                    hasSeenMinesweeperTutorial: false, // **新增**
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
            isNewLogin = false;
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
                // **新增：確保教學旗標存在，若不存在則設為 false**
                playerData.hasSeenMinesweeperTutorial = playerData.hasSeenMinesweeperTutorial || false;

                GAME_LEVELS.forEach(mainLevel => {
                    if (!playerData.levelProgress[mainLevel.id]) {
                        playerData.levelProgress[mainLevel.id] = {
                            isPuzzleComplete: false,
                            ownedPieces: [],
                            placedPieces: {},
                            completedSubLevels: 0
                        };
                    } else {
                        // 確保舊資料有這些欄位，避免 undefined 錯誤
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

            } else {
                // 為新用戶創建資料
                playerData.username = isAnonymous ? "訪客玩家" : (authUser.displayName || (authUser.email ? authUser.email.split('@')[0] : `玩家${userId.substring(0, 5)}`));
                if (!isAnonymous && authUser.email) playerData.email = authUser.email;
                playerData.maxUnlockedLevel = 1;
                playerData.hasSeenMinesweeperTutorial = false; // **新增**
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
                    hasSeenMinesweeperTutorial: playerData.hasSeenMinesweeperTutorial, // **新增**
                    levelProgress: playerData.levelProgress
                });
            }

        } catch (error) {
            console.error("載入玩家數據錯誤:", error);
        }
        showLoading(false);
    }

    async function savePlayerGlobalData() {
        if (!currentUser) return;
        try {
            const dataToSave = {
                username: playerData.username,
                maxUnlockedLevel: playerData.maxUnlockedLevel,
                hasSeenMinesweeperTutorial: playerData.hasSeenMinesweeperTutorial, // **新增：儲存教學旗標**
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
            console.warn(`[Minesweeper] getSubLevelMineCount: 無效的參數或關卡設定。主關卡: ${mainLevelCfg ? mainLevelCfg.id : 'N/A'}, 小關卡索引: ${subLevelIdx}`);
            return mainLevelCfg.msMines || 10;
        }

        const { msGridSize, subLevelsCount, msDensityStart, msDensityEnd } = mainLevelCfg;

        let currentDensity;
        if (subLevelsCount <= 1) {
            currentDensity = msDensityStart;
        } else {
            currentDensity = msDensityStart + (msDensityEnd - msDensityStart) * (subLevelIdx / (subLevelsCount - 1));
        }

        const mineCount = Math.floor(msGridSize * msGridSize * currentDensity);
        return Math.max(1, Math.min(mineCount, msGridSize * msGridSize - 9));
    }

    function createMinesweeperGame(mainLevelCfg, subLevelIdxForDisplay) {
        const gridSize = mainLevelCfg.msGridSize;
        const numMinesTarget = getSubLevelMineCount(mainLevelCfg, currentPlayingSubLevelIndex);
        const maxErrorsAllowed = mainLevelCfg.msMaxErrors;

        console.log(`[Minesweeper] 準備創建小關卡 ${subLevelIdxForDisplay + 1} (主關卡 ${mainLevelCfg.id}): 格子 ${gridSize}x${gridSize}, 目標地雷 ${numMinesTarget}, 容錯 ${maxErrorsAllowed}`);

        if (typeof gridSize !== 'number' || typeof numMinesTarget !== 'number' || typeof maxErrorsAllowed !== 'number' ||
            gridSize <= 0 || numMinesTarget < 0 || maxErrorsAllowed < 0) {
            console.error("[Minesweeper] 無效的關卡設定:", { gridSize, numMinesTarget, maxErrorsAllowed });
            return null;
        }

        const board = [];
        for (let r = 0; r < gridSize; r++) {
            board[r] = [];
            for (let c = 0; c < gridSize; c++) {
                board[r][c] = { r, c, isMine: false, isRevealed: false, isFlagged: false, adjacentMines: 0, isWrongFlag: false };
            }
        }

        // 重置當前小關卡的提示使用次數
        hintsUsedInCurrentSubLevel = 0;

        return {
            board,
            size: gridSize,
            numMines: numMinesTarget,
            maxErrorsAllowed,
            revealedCount: 0,
            flagsPlaced: 0,
            errorsMadeCount: 0,
            gameOver: false,
            gameWon: false,
            firstClickDone: false,
            revealedMinesCount: 0
        };
    }

    function placeMinesAfterFirstClick(game, firstClickR, firstClickC) {
        const gridSize = game.size;
        const numMinesToPlace = game.numMines;
        const forbiddenCells = new Set();

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
        let attempts = 0;
        const maxAttempts = gridSize * gridSize * 2;

        while (minesPlaced < numMinesToPlace && attempts < maxAttempts) {
            const r = Math.floor(Math.random() * gridSize);
            const c = Math.floor(Math.random() * gridSize);
            if (!game.board[r][c].isMine && !forbiddenCells.has(`${r}-${c}`)) {
                game.board[r][c].isMine = true;
                minesPlaced++;
            }
            attempts++;
        }

        if (minesPlaced < numMinesToPlace) {
            console.warn(`[Minesweeper] 未能放置所有預期地雷 (${numMinesToPlace})，實際放置 ${minesPlaced}。可能是由於安全區過大或地雷密度過高。`);
            game.numMines = minesPlaced;
        }

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
            if (minesweeperGridElement) minesweeperGridElement.innerHTML = '錯誤：遊戲數據未載入。';
            return;
        }

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
        let cellSize = Math.floor(containerWidth / game.size) - 2;
        cellSize = Math.max(10, Math.min(cellSize, 30));

        if (containerWidth === 0 && game.size > 0) {
            console.warn("[Minesweeper] 容器寬度為 0，格子可能無法正確渲染。檢查 CSS display 屬性。");
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

                cellEl.classList.remove('wrong-flag-content', 'flagged', 'mine', 'revealed');
                cellEl.textContent = '';

                if (cellData.isRevealed) {
                    cellEl.classList.add('revealed');
                    if (cellData.isWrongFlag) {
                        cellEl.textContent = '❌';
                        cellEl.classList.add('wrong-flag-content');
                    } else if (cellData.isMine) {
                        if (cellData.isFlagged && game.gameOver) {
                            cellEl.classList.add('flagged');
                        } else {
                            cellEl.classList.add('mine');
                            cellEl.textContent = '💣';
                        }
                    } else if (cellData.adjacentMines > 0) {
                        cellEl.textContent = cellData.adjacentMines;
                        cellEl.dataset.mines = cellData.adjacentMines;
                    }
                } else if (cellData.isFlagged) {
                    cellEl.classList.add('flagged');
                }
                minesweeperGridElement.appendChild(cellEl);
            });
        });
        updateMinesweeperInfo();

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

        // 如果是提示模式，處理提示邏輯
        if (hintModeActive) {
            hintModeActive = false;
            const cell = game.board[r][c];
            
            if (cell.isRevealed || cell.isFlagged) {
                showCustomAlert("提示無法用於已揭開或已標記的方塊。", null);
                return;
            }
            
            if (cell.isMine) {
                // 如果是地雷，自動標記旗幟
                toggleMinesweeperFlag(r, c);
                showCustomAlert("提示已幫您標記了一個地雷！", null);
            } else {
                // 如果不是地雷，自動揭開
                revealCellAndNeighbors(r, c);
                showCustomAlert("提示已幫您揭開了一個安全方塊！", null);
            }
            return;
        }

        if (!game.firstClickDone) {
            placeMinesAfterFirstClick(game, r, c);
        }

        const cell = game.board[r][c];

        if (cell.isRevealed && !isChordingTrigger && cell.adjacentMines > 0) {
            let flaggedOrRevealedMinesCount = 0;  // 改名为更准确的变量名
            const neighborsToReveal = [];
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < game.size && nc >= 0 && nc < game.size) {
                        const neighbor = game.board[nr][nc];
                        // 计算标记为旗子或已揭开的炸弹
                        if (neighbor.isFlagged || (neighbor.isRevealed && neighbor.isMine)) {
                            flaggedOrRevealedMinesCount++;
                        } else if (!neighbor.isRevealed) {
                            neighborsToReveal.push({ r: nr, c: nc });
                        }
                    }
                }
            }

            // 使用 flaggedOrRevealedMinesCount 而不是 flaggedNeighbors
            if (flaggedOrRevealedMinesCount === cell.adjacentMines) {
                neighborsToReveal.forEach(n => revealMinesweeperCell(n.r, n.c, true));
            }
            if (!isChordingTrigger && neighborsToReveal.length > 0) {
                renderMinesweeperBoard();
                if (!game.gameOver) checkMinesweeperWinCondition();
            }
            return;
        }

        if (cell.isRevealed || (cell.isFlagged && !isChordingTrigger)) return;

        cell.isRevealed = true;
        game.revealedCount++;

        if (cell.isMine) {
            game.revealedMinesCount++;
            game.errorsMadeCount++;
            if (game.errorsMadeCount >= game.maxErrorsAllowed) {
                game.gameOver = true;
                game.gameWon = false;
                if (minesweeperMessage) minesweeperMessage.textContent = "遊戲失敗！踩到太多地雷了。";
                revealAllMines(false);
                setTimeout(() => {
                    showCustomAlert("遊戲失敗，錯誤次數過多。按確認返回關卡選擇。", () => {
                        currentMinesweeperGame = null;
                        currentPlayingSubLevelIndex = -1;
                        loadMainLevel(currentMainLevelId);
                        showScreen('inLevel');
                    });
                }, 500);
            }
        } else {
            if (cell.adjacentMines === 0) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < game.size && nc >= 0 && nc < game.size) {
                            if (!game.board[nr][nc].isRevealed && !game.board[nr][nc].isFlagged) {
                                revealMinesweeperCell(nr, nc, true);
                            }
                        }
                    }
                }
            }
        }
        if (!isChordingTrigger) {
            renderMinesweeperBoard();
            if (!game.gameOver) checkMinesweeperWinCondition();
        }
    }

    // 新增：揭開方塊及其相鄰方塊（用於提示功能）
    function revealCellAndNeighbors(r, c) {
        const game = currentMinesweeperGame;
        if (!game || game.gameOver) return;
        
        const cell = game.board[r][c];
        if (cell.isRevealed || cell.isFlagged) return;
        
        cell.isRevealed = true;
        game.revealedCount++;
        
        if (cell.adjacentMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < game.size && nc >= 0 && nc < game.size) {
                        if (!game.board[nr][nc].isRevealed && !game.board[nr][nc].isFlagged) {
                            revealCellAndNeighbors(nr, nc);
                        }
                    }
                }
            }
        }
        
        renderMinesweeperBoard();
        checkMinesweeperWinCondition();
    }

    function toggleMinesweeperFlag(r, c) {
        if (!currentMinesweeperGame || currentMinesweeperGame.gameOver || !currentMinesweeperGame.firstClickDone) return;
        const game = currentMinesweeperGame;
        const cell = game.board[r][c];

        if (cell.isRevealed) return;

        cell.isFlagged = !cell.isFlagged;
        game.flagsPlaced += cell.isFlagged ? 1 : -1;

        renderMinesweeperBoard();
    }

    function checkMinesweeperWinCondition() {
        if (!currentMinesweeperGame || !currentMinesweeperGame.firstClickDone) return;
        const game = currentMinesweeperGame;
        if (game.gameOver) return;

        const totalCells = game.size * game.size;
        const actualMinesOnBoard = game.numMines;
        const safeCellsTotal = totalCells - actualMinesOnBoard;
        const safeCellsRevealedSoFar = game.revealedCount - game.revealedMinesCount;

        const mainLevelProgress = playerData.levelProgress[currentMainLevelId];
        const wasFirstTimeCompletionAttempt = currentPlayingSubLevelIndex >= mainLevelProgress.completedSubLevels;

        if (safeCellsRevealedSoFar === safeCellsTotal && game.errorsMadeCount < game.maxErrorsAllowed) {
            game.gameOver = true;
            game.gameWon = true;

            const pieceObtainedNow = awardPuzzlePiece();
            revealAllMines(true); // 遊戲勝利，顯示所有地雷

            let winMessage = "";
            if (wasFirstTimeCompletionAttempt) {
                if (pieceObtainedNow) {
                    winMessage = "拼圖碎片已獲得！按確認返回關卡畫面。";
                } else {
                    winMessage = "恭喜完成！您已擁有此主關卡的所有拼圖碎片。按確認返回關卡畫面。";
                }
                if (minesweeperMessage) minesweeperMessage.textContent = pieceObtainedNow ? "恭喜！成功完成踩地雷！獲得一個拼圖碎片！" : "恭喜！成功完成踩地雷！";

            } else {
                winMessage = "此小關卡的拼圖先前已獲得。按確認返回關卡畫面。";
                if (minesweeperMessage) minesweeperMessage.textContent = "恭喜！再次完成此關卡！";
            }

            setTimeout(() => {
                showCustomAlert(winMessage, () => {
                    currentMinesweeperGame = null;
                    currentPlayingSubLevelIndex = -1;
                    loadMainLevel(currentMainLevelId);
                    showScreen('inLevel');
                });
            }, 500);
        }
    }

    function revealAllMines(isWin) {
        if (!currentMinesweeperGame) return;
        const game = currentMinesweeperGame;
        game.board.forEach(row => {
            row.forEach(cellData => {
                cellData.isWrongFlag = false;
                if (isWin) { // 玩家勝利
                    if (cellData.isMine) {
                        cellData.isFlagged = true;
                        cellData.isRevealed = true;
                    }
                } else { // 玩家失敗
                    if (cellData.isMine) {
                        cellData.isRevealed = true;
                    } else {
                        if (cellData.isFlagged) {
                            cellData.isWrongFlag = true;
                            cellData.isRevealed = true;
                        }
                    }
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
        if (hintsLeftDisplay) hintsLeftDisplay.textContent = currentMainLevelConfig.maxHints - hintsUsedInCurrentSubLevel;
    }

    function awardPuzzlePiece() {
        if (!currentMainLevelConfig || !playerData.levelProgress[currentMainLevelId]) {
            console.warn("無法獎勵拼圖：主關卡設定或進度未載入。");
            return false;
        }

        const mainLevelProgress = playerData.levelProgress[currentMainLevelId];
        let pieceActuallyAwardedThisTime = false;

        if (currentPlayingSubLevelIndex === mainLevelProgress.completedSubLevels) {
            mainLevelProgress.completedSubLevels++;
            console.log(`主關卡 ${currentMainLevelId} 的已完成小關卡數更新為: ${mainLevelProgress.completedSubLevels}`);

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
                    pieceActuallyAwardedThisTime = true;
                } else {
                    console.log(`主關卡 ${currentMainLevelId} 的所有拼圖碎片均已擁有 (在首次完成此小關卡時檢查)。`);
                }
            } else {
                console.log(`已擁有主關卡 ${currentMainLevelId} 的所有 ${currentMainLevelConfig.puzzlePiecesCount} 個碎片 (在首次完成此小關卡時檢查)。`);
            }
        } else {
            console.log(`重玩已完成的小關卡 ${currentPlayingSubLevelIndex + 1}，不獎勵新碎片，也不改變 completedSubLevels (${mainLevelProgress.completedSubLevels})。`);
        }

        saveLevelProgress(currentMainLevelId);
        return pieceActuallyAwardedThisTime;
    }

    // --- Jigsaw Puzzle (拼圖遊戲邏輯) ---
    let draggedPieceElement = null;

    async function setupJigsawPuzzle() {
        if (!currentMainLevelConfig) {
            console.error("無法設定拼圖：currentMainLevelConfig 未定義。");
            return;
        }
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;

        currentJigsawState = { image: null, pieces: [], slots: [], ownedPieceIds: [], placedPieceMap: {} };
        if (jigsawFrameContainer) jigsawFrameContainer.innerHTML = '';
        if (jigsawPiecesContainer) jigsawPiecesContainer.innerHTML = '';
        if (jigsawMessage) jigsawMessage.textContent = '';

        const levelProgress = playerData.levelProgress[currentMainLevelId];
        if (!levelProgress) {
            if (jigsawMessage) jigsawMessage.textContent = "無法載入拼圖進度。";
            return;
        }
        currentJigsawState.ownedPieceIds = [...(levelProgress.ownedPieces || [])];
        currentJigsawState.placedPieceMap = { ...(levelProgress.placedPieces || {}) };

        const img = new Image();
        img.src = currentMainLevelConfig.imagePath;

        showLoading(true);
        img.onload = () => {
            currentJigsawState.image = img;
            const naturalPieceWidth = img.naturalWidth / currentMainLevelConfig.puzzleCols;
            const naturalPieceHeight = img.naturalHeight / currentMainLevelConfig.puzzleRows;

            const jigsawArea = document.getElementById('jigsaw-puzzle-area');
            let availableWidth = window.innerWidth * 0.9;
            if (jigsawArea && jigsawArea.offsetParent) {
                availableWidth = jigsawArea.clientWidth * 0.9;
            }
            const frameContainerMaxWidth = Math.min(600, availableWidth);

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

                        currentJigsawState.pieces.push({ id: pieceId, element: pieceCanvas, r, c, isPlaced: false });

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
            window.scrollTo(scrollX, scrollY);
        };
        img.onerror = () => {
            if (jigsawMessage) jigsawMessage.textContent = "無法載入拼圖圖片: " + currentMainLevelConfig.imagePath;
            console.error("拼圖圖片載入失敗:", currentMainLevelConfig.imagePath);
            showLoading(false);
            window.scrollTo(scrollX, scrollY);
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
            if (jigsawMessage) jigsawMessage.textContent = "位置不對喔！再試試看。";
            if (draggedPieceElement.parentElement !== jigsawPiecesContainer) {
                if (jigsawPiecesContainer) jigsawPiecesContainer.appendChild(draggedPieceElement);
            }
            setTimeout(() => { if (jigsawMessage) jigsawMessage.textContent = "" }, 2000);
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
            if (jigsawMessage) jigsawMessage.textContent = "放對了！";
            setTimeout(() => {
                pieceEl.classList.remove('placed-animation');
                if (jigsawMessage) jigsawMessage.textContent = "";
            }, 1200);
        }
    }

    function checkJigsawWin() {
        if (!currentMainLevelConfig || !playerData.levelProgress[currentMainLevelId]) return;

        const totalPiecesForLevel = currentMainLevelConfig.puzzlePiecesCount;
        const placedCount = Object.keys(currentJigsawState.placedPieceMap).length;

        updateLevelPuzzleProgressDisplay();

        if (placedCount === totalPiecesForLevel && totalPiecesForLevel > 0) {
            if (jigsawMessage) jigsawMessage.textContent = `恭喜！${currentMainLevelConfig.name} 拼圖完成！`;
            const wasAlreadyComplete = playerData.levelProgress[currentMainLevelId].isPuzzleComplete;
            playerData.levelProgress[currentMainLevelId].isPuzzleComplete = true;

            if (currentMainLevelId < GAME_LEVELS.length && currentMainLevelId >= playerData.maxUnlockedLevel) {
                playerData.maxUnlockedLevel = currentMainLevelId + 1;
                savePlayerGlobalData();
                populateLevelSelectScreen();
            }
            saveLevelProgress(currentMainLevelId);

            showCustomAlert(`${currentMainLevelConfig.name} 拼圖已完成！`, () => {
                if (!wasAlreadyComplete && currentMainLevelConfig.completionImagePath) {
                    showCompletionImageModal(currentMainLevelConfig.completionImagePath, () => {
                        loadMainLevel(currentMainLevelId);
                        showScreen('inLevel');
                    });
                } else {
                    loadMainLevel(currentMainLevelId);
                    showScreen('inLevel');
                }
            });
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
                console.log("[Back to Level Select] currentMainLevelId:", currentMainLevelId);
                currentMainLevelId = null;
                currentMainLevelConfig = null;
                populateLevelSelectScreen();
                showScreen('levelSelect');
            });
        }
        const minesweeperBackButton = document.getElementById('minesweeper-back-button');
        if (minesweeperBackButton) {
            minesweeperBackButton.addEventListener('click', () => {
                console.log("[Minesweeper Back] currentMainLevelId BEFORE calling loadMainLevel:", currentMainLevelId);
                if (currentMainLevelId === null || typeof currentMainLevelId === 'undefined') {
                    console.error("[Minesweeper Back] currentMainLevelId is invalid. Navigating to level select.");
                    currentMainLevelConfig = null;
                    populateLevelSelectScreen();
                    showScreen('levelSelect');
                    return;
                }
                currentMinesweeperGame = null;
                currentPlayingSubLevelIndex = -1;
                loadMainLevel(currentMainLevelId);
            });
        }
        const jigsawBackButton = document.getElementById('jigsaw-back-button');
        if (jigsawBackButton) {
            jigsawBackButton.addEventListener('click', () => {
                console.log("[Jigsaw Back] currentMainLevelId BEFORE calling loadMainLevel:", currentMainLevelId);
                if (currentMainLevelId === null || typeof currentMainLevelId === 'undefined') {
                    console.error("[Jigsaw Back] currentMainLevelId is invalid. Navigating to level select.");
                    currentMainLevelConfig = null;
                    populateLevelSelectScreen();
                    showScreen('levelSelect');
                    return;
                }
                loadMainLevel(currentMainLevelId);
            });
        }

        if (playJigsawButton) {
            playJigsawButton.addEventListener('click', startJigsawGame);
        }

        // 新增：上一關按鈕事件監聽
        if (prevLevelButton) {
            prevLevelButton.addEventListener('click', () => {
                if (currentMainLevelId && currentMainLevelId > 1) {
                    const prevLevelId = currentMainLevelId - 1;
                    loadMainLevel(prevLevelId);
                }
            });
        }

        // 新增：下一關按鈕事件監聽
        if (nextLevelButton) {
            nextLevelButton.addEventListener('click', () => {
                if (currentMainLevelId && currentMainLevelId < GAME_LEVELS.length) {
                    const nextLevelId = currentMainLevelId + 1;
                    if (nextLevelId <= playerData.maxUnlockedLevel) {
                        loadMainLevel(nextLevelId);
                    }
                }
            });
        }

        // 新增：提示按鈕事件監聽
        const minesweeperHintButton = document.getElementById('minesweeper-hint-button');
        if (minesweeperHintButton) {
            minesweeperHintButton.addEventListener('click', () => {
                if (!currentMinesweeperGame || currentMinesweeperGame.gameOver || !currentMainLevelConfig) return;
                
                const remainingHints = currentMainLevelConfig.maxHints - hintsUsedInCurrentSubLevel;
                if (remainingHints <= 0) {
                    showCustomAlert("本小關卡的提示次數已用完！", null);
                    return;
                }
                
                showHintConfirmModal((confirmed) => {
                    if (confirmed) {
                        hintsUsedInCurrentSubLevel++;
                        hintModeActive = true;
                        updateMinesweeperInfo();
                        showCustomAlert("提示已啟用！請點擊一個方塊來使用提示。", null);
                    }
                });
            });
        }

        if (minesweeperGridElement) {
            minesweeperGridElement.addEventListener('click', (e) => {
                if (isLongPress) {
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

            minesweeperGridElement.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                const cellEl = e.target.closest('.ms-cell');
                if (cellEl && currentMinesweeperGame && !currentMinesweeperGame.gameOver && currentMinesweeperGame.firstClickDone) {
                    isLongPress = false;
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
            minesweeperGridElement.addEventListener('mouseleave', () => {
                clearTimeout(pressTimer);
            });

            minesweeperGridElement.addEventListener('touchstart', (e) => {
                const cellEl = e.target.closest('.ms-cell');
                if (cellEl && currentMinesweeperGame && !currentMinesweeperGame.gameOver && currentMinesweeperGame.firstClickDone) {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        const r = parseInt(cellEl.dataset.r);
                        const c = parseInt(cellEl.dataset.c);
                        toggleMinesweeperFlag(r, c);
                        if (navigator.vibrate) navigator.vibrate(50);
                    }, LONG_PRESS_DURATION);
                }
            }, { passive: true });

            minesweeperGridElement.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
            });
            minesweeperGridElement.addEventListener('touchmove', () => {
                clearTimeout(pressTimer);
                isLongPress = false;
            });
        }

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (screens.minesweeper && screens.minesweeper.classList.contains('active') && currentMinesweeperGame) {
                    renderMinesweeperBoard();
                }
                if (screens.jigsaw && screens.jigsaw.classList.contains('active') && currentJigsawState.image && currentMainLevelConfig) {
                    console.log("Window resized, re-setting up jigsaw puzzle.");
                    setupJigsawPuzzle();
                }
            }, 250);
        });

        if (showGameRulesButton) {
            showGameRulesButton.addEventListener('click', () => {
                showInstructionsModal(null); // 呼叫顯示遊戲總說明的函式
            });
        }
        
        if (showMinesweeperRulesButton) {
            showMinesweeperRulesButton.addEventListener('click', () => {
                showMinesweeperTutorialModal(null); // 呼叫顯示踩地雷教學的函式
            });
        }
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
        console.log(`[loadMainLevel] Attempting to load level ID: ${mainLevelIdToLoad} (type: ${typeof mainLevelIdToLoad})`);
        if (mainLevelIdToLoad === null || typeof mainLevelIdToLoad === 'undefined') {
            console.error("[loadMainLevel] Invalid mainLevelIdToLoad. Navigating to level select.");
            currentMainLevelId = null;
            currentMainLevelConfig = null;
            populateLevelSelectScreen();
            showScreen('levelSelect');
            return;
        }

        const newConfig = GAME_LEVELS.find(l => l.id === mainLevelIdToLoad);

        if (!newConfig) {
            console.error(`[loadMainLevel] 主關卡設定未找到 for ID: ${mainLevelIdToLoad}. Navigating to level select.`);
            currentMainLevelId = null;
            currentMainLevelConfig = null;
            populateLevelSelectScreen();
            showScreen('levelSelect');
            return;
        }

        currentMainLevelId = mainLevelIdToLoad;
        currentMainLevelConfig = newConfig;
        console.log("[loadMainLevel] Successfully set currentMainLevelId:", currentMainLevelId);
        console.log("[loadMainLevel] Successfully set currentMainLevelConfig:", currentMainLevelConfig ? { ...currentMainLevelConfig } : undefined);

        if (currentLevelTitle) currentLevelTitle.textContent = `${currentMainLevelConfig.name}`;
        populateSubLevelButtons();
        updateLevelPuzzleProgressDisplay();
        
        // 檢查是否顯示上一關按鈕
        if (prevLevelButton) {
            if (currentMainLevelId > 1) {
                prevLevelButton.style.display = 'inline-block';
            } else {
                prevLevelButton.style.display = 'none';
            }
        }
        
        // 檢查是否顯示下一關按鈕
        if (nextLevelButton) {
            const levelProgress = playerData.levelProgress[currentMainLevelId];
            if (levelProgress && levelProgress.isPuzzleComplete && 
                currentMainLevelId < GAME_LEVELS.length && 
                currentMainLevelId < playerData.maxUnlockedLevel) {
                nextLevelButton.style.display = 'inline-block';
            } else {
                nextLevelButton.style.display = 'none';
            }
        }
        
        showScreen('inLevel');
    }

    function populateSubLevelButtons() {
        if (!subLevelButtonsContainer || !currentMainLevelConfig || !playerData.levelProgress[currentMainLevelId]) {
            if (subLevelButtonsContainer) subLevelButtonsContainer.innerHTML = '小關卡載入錯誤。';
            else console.error("subLevelButtonsContainer 未找到或關卡數據不完整, currentMainLevelConfig:", currentMainLevelConfig, "currentMainLevelId:", currentMainLevelId);
            return;
        }
        subLevelButtonsContainer.innerHTML = '';

        const mainLevelProgress = playerData.levelProgress[currentMainLevelId];
        if (!mainLevelProgress) {
            console.error(`[populateSubLevelButtons] No progress data for level ${currentMainLevelId}`);
            return;
        }
        const completedSubLevelsCount = mainLevelProgress.completedSubLevels || 0;

        for (let i = 0; i < currentMainLevelConfig.subLevelsCount; i++) {
            const subLevelButton = document.createElement('button');
            subLevelButton.textContent = `小關卡 ${i + 1}`;
            subLevelButton.classList.add('sub-level-button');

            if (i < completedSubLevelsCount) {
                subLevelButton.disabled = false;
                subLevelButton.title = `重玩 小關卡 ${i + 1}`;
                subLevelButton.classList.add('completed');
                subLevelButton.textContent += " (已完成)";
                subLevelButton.addEventListener('click', () => {
                    showReplayConfirmDialog((confirmed) => {
                        if (confirmed) {
                            startMinesweeperForSubLevel(i);
                        }
                    });
                });
            } else if (i === completedSubLevelsCount) {
                subLevelButton.disabled = false;
                subLevelButton.title = `開始 小關卡 ${i + 1}`;
                subLevelButton.addEventListener('click', () => startMinesweeperForSubLevel(i));
            } else {
                subLevelButton.disabled = true;
                subLevelButton.title = "需先完成前面的小關卡";
            }
            subLevelButtonsContainer.appendChild(subLevelButton);
        }
    }

    function startMinesweeperForSubLevel(subLevelIndexToPlay) {
        if (!currentMainLevelConfig || currentMainLevelConfig.id !== currentMainLevelId) {
            console.error("[Main] 無法開始踩地雷：主關卡設定未定義或不匹配。");
            return;
        }
        currentPlayingSubLevelIndex = subLevelIndexToPlay;
    
        // 直接開始遊戲，不再檢查教學旗標
        if (minesweeperMessage) minesweeperMessage.textContent = '';
        const msTitleElement = document.getElementById('minesweeper-level-title');
        if (msTitleElement) {
            msTitleElement.textContent = `踩地雷 - ${currentMainLevelConfig.name} (小關卡 ${currentPlayingSubLevelIndex + 1})`;
        }
    
        currentMinesweeperGame = createMinesweeperGame(currentMainLevelConfig, currentPlayingSubLevelIndex);
        if (!currentMinesweeperGame) {
            console.error("[Main] 踩地雷遊戲物件創建失敗。");
            currentPlayingSubLevelIndex = -1;
            return;
        }
    
        showScreen('minesweeper');
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
        if (!mainLevelProgress) {
            console.error(`[updateLevelPuzzleProgressDisplay] No progress data for level ${currentMainLevelId}`);
            if (levelPuzzleProgressDisplay) levelPuzzleProgressDisplay.textContent = "拼圖進度: 無進度數據";
            return;
        }
        const totalPieces = currentMainLevelConfig.puzzlePiecesCount;
        const ownedCount = (mainLevelProgress.ownedPieces || []).length;
        const placedCount = Object.keys(mainLevelProgress.placedPieces || {}).length;

        let progressText = `拼圖: ${placedCount} / ${ownedCount} (已擁有), 共 ${totalPieces} 塊。`;
        if (mainLevelProgress.isPuzzleComplete) {
            progressText += " - 👍 拼圖已完成！";
        }
        levelPuzzleProgressDisplay.textContent = progressText;
    }

    function startJigsawGame() {
        console.log("[startJigsawGame] Called. currentMainLevelId is:", currentMainLevelId, typeof currentMainLevelId);
        console.log("[startJigsawGame] currentMainLevelConfig (before check) is:", currentMainLevelConfig ? { ...currentMainLevelConfig } : null);

        if (!currentMainLevelId || !currentMainLevelConfig || currentMainLevelConfig.id !== currentMainLevelId) {
            console.error("[startJigsawGame] Invalid state before starting. currentMainLevelId:", currentMainLevelId, "Config ID:", currentMainLevelConfig ? currentMainLevelConfig.id : "null");
            currentMainLevelId = null;
            currentMainLevelConfig = null;
            populateLevelSelectScreen();
            showScreen('levelSelect');
            return;
        }

        const levelProgress = playerData.levelProgress[currentMainLevelId];
        if (levelProgress && levelProgress.isPuzzleComplete && currentMainLevelConfig.completionImagePath && currentMainLevelConfig.imagePath) {
            console.log(`[startJigsawGame] Level ${currentMainLevelId} puzzle is already complete. Showing image toggle modal.`);
            showImageToggleModal(currentMainLevelConfig.imagePath, currentMainLevelConfig.completionImagePath, () => {
                console.log("[startJigsawGame] Image toggle modal closed. Staying on inLevel screen.");
            });
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
            console.log("[onAuthStateChanged] User state changed. User:", user ? user.uid : null, "isAnonymous:", user ? user.isAnonymous : null);
            let previousMainLevelId = currentMainLevelId;
            console.log("[onAuthStateChanged] currentMainLevelId BEFORE auth change processing:", currentMainLevelId);
            showLoading(true);

            if (user) { // 使用者已登入
                currentUser = user;
                await loadPlayerData(user.uid, user.isAnonymous, user);

                if (usernameDisplay) usernameDisplay.textContent = playerData.username;
                if (userInfoContainer) userInfoContainer.style.display = 'flex';
                if (logoutButton) logoutButton.style.display = 'inline-block';

                const proceedToGame = () => {
                    let landedOnLevelSelect = false;
                    let validPreviousLevelId = previousMainLevelId !== null && typeof previousMainLevelId !== 'undefined';
                    let configForPrevious = validPreviousLevelId ? GAME_LEVELS.find(l => l.id === previousMainLevelId) : null;
                    if (configForPrevious) {
                        console.log("[onAuthStateChanged] User logged in. Restoring previous level ID:", previousMainLevelId);
                        currentMainLevelId = previousMainLevelId;
                        currentMainLevelConfig = configForPrevious;
                        loadMainLevel(currentMainLevelId);
                    } else {
                        console.log("[onAuthStateChanged] User logged in. No valid previous level or previous ID was null. Showing level select. Prev ID:", previousMainLevelId);
                        currentMainLevelId = null;
                        currentMainLevelConfig = null;
                        populateLevelSelectScreen();
                        showScreen('levelSelect');
                        landedOnLevelSelect = true;
                    }
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
                    return landedOnLevelSelect;
                };
                
                if (isNewLogin && !playerData.hasSeenMinesweeperTutorial) {
                    // 條件：是新登入，而且從沒看過教學
                    isNewLogin = false; // 重設旗標

                    // 依序顯示視窗：總說明 -> 詢問視窗 -> 進入遊戲
                    showInstructionsModal(() => {
                        showTutorialQueryModal(proceedToGame);
                    });
                } else {
                    // 條件：是老玩家，或已經處理過教學
                    isNewLogin = false; // 重設旗標
                    proceedToGame(); // 直接進入遊戲
                }

            } else { // 使用者已登出
                currentUser = null;
                playerData = { username: '', maxUnlockedLevel: 1, hasSeenMinesweeperTutorial: false, levelProgress: {} };
                GAME_LEVELS.forEach(level => {
                    playerData.levelProgress[level.id] = {
                        isPuzzleComplete: false, ownedPieces: [], placedPieces: {}, completedSubLevels: 0
                    };
                });

                currentMainLevelId = null;
                currentMainLevelConfig = null;
                currentPlayingSubLevelIndex = -1;
                console.log("[onAuthStateChanged] User logged out. Resetting level states.");

                if (userInfoContainer) userInfoContainer.style.display = 'none';
                if (logoutButton) logoutButton.style.display = 'none';
                if (forgotPasswordSection) forgotPasswordSection.style.display = 'none';
                if (loginForm) loginForm.style.display = 'block';
                if (registerForm) registerForm.style.display = 'none';
                showScreen('auth');
            }
            console.log("[onAuthStateChanged] currentMainLevelId AFTER auth change processing:", currentMainLevelId);
            showLoading(false);
        });
    } else {
        console.error("Auth 物件未初始化，無法設定 onAuthStateChanged 監聽器。");
        showScreen('auth');
        showLoading(false);
    }

    // --- 初始化遊戲 ---
    initializeUI();
});