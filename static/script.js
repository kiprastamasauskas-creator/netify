// Global Application State tracking
let appState = {
    userLoggedIn: false,
    userId: null,
    selectedPlanName: 'Basic Plan',
    selectedPlanPrice: 39,
    hasSubscription: false,
    activeBillElement: null,
    selectedBillId: null,  // Tracks active MySQL ID for payment transactions
    savedCard: null,       // Track if card token exists
    useToken: false        // Check whether checkout routes via Token
};

/**
 * Displays a non-blocking UI notification banner within the currently active tab/form
 * @param {string} message - The text to display
 * @param {string} type - 'success', 'error', or 'info'
 * @param {HTMLElement|null} targetContainer - Optional explicit container
 */
function showBanner(message, type = 'info', targetContainer = null) {
    // 50ms buffer ensures any DOM tab switches or container visibility changes finish rendering first
    setTimeout(() => {
        let banner = null;

        // 1. Check inside an explicitly passed container
        if (targetContainer) {
            banner = targetContainer.querySelector('.status-banner');
        }

        // 2. Look inside the currently visible tab/form
        if (!banner) {
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) {
                // Look for visible form/container banners first
                const visibleSubContainer = activeTab.querySelector('form:not(.hidden) > .status-banner, div:not(.hidden) > .status-banner');
                banner = visibleSubContainer || activeTab.querySelector('.status-banner');
            }
        }

        // 3. Global fallback
        if (!banner) {
            banner = document.querySelector('.status-banner');
        }

        if (!banner) return;

        // Reset styles and update content
        banner.className = `status-banner ${type}`;
        banner.textContent = message;
        banner.classList.remove('hidden');

        // Automatically dismiss after 5 seconds
        setTimeout(() => {
            banner.classList.add('hidden');
        }, 5000);
    }, 50);
}


function switchTab(tabId, pushToHistory = true) {
    // 1. Hide all tabs safely
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        if (tab) tab.classList.remove('active');
    });

    // 2. Deactivate navbar button styling
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        if (btn) btn.classList.remove('active');
    });

    // 3. Reveal the selected tab
    const targetTab = document.getElementById(`${tabId}-tab`);
    if (targetTab) {
        targetTab.classList.add('active');
    } else {
        console.error(`Layout Error: Could not find HTML element with ID: "${tabId}-tab"`);
    }

    // 4. Highlight active button matching data-tab attribute
    const activeBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // 💾 Save active tab to localStorage
    localStorage.setItem('activeTab', tabId);

    // 📜 Push tab change to browser history stack (for Back/Forward arrows)
    if (pushToHistory && history.state?.tabId !== tabId) {
        history.pushState({ tabId: tabId }, '', `#${tabId}`);
    }
}

/**
 * Create Account workflow: Step 1 - Choose Package Selection
 */
function selectPlan(planName, price) {
    appState.selectedPlanName = planName;
    appState.selectedPlanPrice = price;

    const formTitle = document.getElementById('selected-plan-title');
    const signupForm = document.getElementById('signup-form');

    formTitle.textContent = `Signing up for: ${planName} ($${price}/mo)`;
    signupForm.classList.remove('hidden');
    signupForm.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Create Account workflow: Step 2 - Validation + Live Database Submission
 */
async function handleSignUp(event) {
    event.preventDefault();

    const phoneInput = document.getElementById('reg-phone').value.trim();

    // Enforce valid Belgian phone numbers
    const belgianPhoneRegex = /^(?:\+32\s?|0)[1-9](?:\s?\d){7,8}$/;
    if (!belgianPhoneRegex.test(phoneInput)) {
        showBanner("Please enter a valid Belgian phone number format (e.g., 0470 12 34 56).", "error");
        return; 
    }

    const signupForm = document.getElementById('signup-form');
    const formData = new FormData(signupForm);
    formData.append('selected-plan', appState.selectedPlanName);

    try {
        const response = await fetch('/register', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();  

        if (result.status === 'success') {
            document.getElementById('verify-tab').classList.remove('hidden');
            switchTab('verify'); 
            showBanner(result.message, "success");
        } else {
            showBanner("Registration Failure: " + result.message, "error");
        }   
    } catch (error) {
        console.error("Network connectivity error:", error);
        showBanner("Network Error: Could not connect to the backend server.", "error");
    }
}

/**
 * Create account verification function
 */
function handleVerify(event) {
    event.preventDefault();

    const verifyForm = event.target;
    const formData = new FormData(verifyForm);

    fetch('/verify-registration', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            verifyForm.reset();
            document.getElementById('verify-tab').classList.add('hidden');
            switchTab('login');
            showBanner(data.message, "success");
        } else {
            showBanner("Verification Failure: " + data.message, "error");
        }
    })
    .catch(error => {
        console.error("Network connectivity error:", error);
        showBanner("Network Error: Could not connect to the verification server.", "error");
    });
}


function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.redirect) {
            window.location.href = data.redirect; 
            return;
        }

        // 2. Standard MFA Workflow
        if (data.status === 'mfa_required') {
            document.getElementById('login-container').classList.add('hidden');
            document.getElementById('mfa-container').classList.remove('hidden');
            showBanner("Please enter the verification code sent to your email.", "info", document.getElementById('mfa-container'));
        } else {
            showBanner("Login Failure: " + data.message, "error");
        }
    })
    .catch(error => {
        console.error("Network connectivity error:", error);
        showBanner("Network Error: Could not connect to the authentication server.", "error");
    });
}

function handleMfaVerify(event) {
    event.preventDefault();

    const code = document.getElementById('mfa-code').value;

    fetch('/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            appState.userLoggedIn = true;
            appState.hasSubscription = true;
            appState.userId = data.user.id;
            appState.selectedPlanName = data.user.selected_plan || 'Basic Plan';
            appState.savedCard = data.payment;

            // 💾 Store complete session payload
            localStorage.setItem('sessionData', JSON.stringify(data));

            if (appState.selectedPlanName === 'Ultra Plan') {
                appState.selectedPlanPrice = 59;
            } else if (appState.selectedPlanName === 'Giga Plan') {
                appState.selectedPlanPrice = 79;
            } else {
                appState.selectedPlanPrice = 39;
            }

            renderDatabaseBills(data.bills || []);
            renderSavedCardUI();

            document.getElementById('dash-plan-name').textContent = appState.selectedPlanName;
            // Set top greeting and profile status separately
            const userFullName = `${data.user.first_name} ${data.user.last_name}`;
            document.getElementById('dash-greeting-title').textContent = `Great to see you, ${userFullName}!`;
            document.getElementById('dash-plan-status').textContent = `Your internet profile is active at $${appState.selectedPlanPrice}/month.`;
            
            document.getElementById('nav-dashboard').classList.remove('hidden');
            switchTab('dashboard');
            showBanner(data.message || "Authentication successful! Welcome back.", "success");
        } else {
            showBanner("Verification Failure: " + data.message, "error");
        }
    })
    .catch(error => {
        console.error("Network connectivity error:", error);
        showBanner("Network Error: Could not connect to the verification server.", "error");
    });
}

/**
 * Renders an array of bills pulled from MySQL straight into HTML
 */
function renderDatabaseBills(bills) {
    const billListContainer = document.getElementById('dash-bill-list');
    billListContainer.innerHTML = ''; 

    if (!bills || bills.length === 0) {
        billListContainer.innerHTML = '<li class="text-muted">No bills generated for this account yet.</li>';
        return;
    }

    bills.forEach(bill => {
        const li = document.createElement('li');
        li.id = `bill-${bill.id}`;
        
        const statusClass = bill.status === 'paid' ? 'paid' : 'unpaid';
        const capitalizedStatus = bill.status.charAt(0).toUpperCase() + bill.status.slice(1);

        li.innerHTML = `
            <span>${bill.billing_period} Statement ($${Number(bill.amount).toFixed(2)})</span>
            <span class="bill-status ${statusClass}">${capitalizedStatus}</span>
        `;
        
        li.addEventListener('click', () => {
            selectDatabaseBill(li, bill);
        });
        
        billListContainer.appendChild(li);
    });
}

/**
 * Handles selecting a dynamic database bill row
 */
function selectDatabaseBill(element, bill) {
    if (bill.status === 'paid') {
        showBanner("This invoice has already been fully paid.", "info");
        document.getElementById('cc-payment-box').classList.add('hidden');
        return;
    }

    if (appState.activeBillElement) {
        appState.activeBillElement.classList.remove('selected-bill');
    }
    
    element.classList.add('selected-bill');
    appState.activeBillElement = element;
    appState.selectedBillId = bill.id;

    const paymentBox = document.getElementById('cc-payment-box');
    const paymentTargetText = document.getElementById('payment-target');
    
    paymentTargetText.textContent = `Paying for: ${bill.billing_period} ($${Number(bill.amount).toFixed(2)})`;
    
    const cardNum = document.getElementById('card-num');
    const cardExp = document.getElementById('card-exp');
    const cardCvc = document.getElementById('card-cvc');

    if (appState.savedCard) {
        cardNum.value = `•••• •••• •••• ${appState.savedCard.card_last_four}`;
        cardExp.value = appState.savedCard.expiry;
        cardCvc.value = '•••';
        
        cardNum.disabled = true;
        cardExp.disabled = true;
        cardCvc.disabled = true;
        
        appState.useToken = true;
    } else {
        cardNum.value = '';
        cardExp.value = '';
        cardCvc.value = '';
        
        cardNum.disabled = false;
        cardExp.disabled = false;
        cardCvc.disabled = false;
        
        appState.useToken = false;
    }

    paymentBox.classList.remove('hidden');
    paymentBox.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Processes credit card security verification and updates MySQL
 */
function handlePayment(event) {
    event.preventDefault();
    
    if (!appState.selectedBillId) {
        showBanner("Payment Error: No statement selected.", "error");
        return;
    }

    const payload = { bill_id: appState.selectedBillId };

    if (appState.useToken && appState.savedCard) {
        payload.token = appState.savedCard.token;
    } else {
        payload.card_number = document.getElementById('card-num').value.trim();
        payload.expiry = document.getElementById('card-exp').value.trim();
        payload.cvc = document.getElementById('card-cvc').value.trim();
    }

    fetch('/pay-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showBanner("Payment Approved!", "success");
            
            if (appState.activeBillElement) {
                const statusLabel = appState.activeBillElement.querySelector('.bill-status');
                statusLabel.textContent = "Paid";
                statusLabel.classList.remove('unpaid');
                statusLabel.classList.add('paid');
                appState.activeBillElement.classList.remove('selected-bill');
            }
            
            appState.selectedBillId = null;
            document.getElementById('cc-payment-box').classList.add('hidden');
        } else {
            showBanner("Database Payment Error: " + data.message, "error");
        }
    })
    .catch(error => {
        console.error(error);
        showBanner("Network Error processing payment.", "error");
    });
}

function updateDashboardUI() {
    document.getElementById('dash-plan-name').textContent = appState.selectedPlanName;
}

/**
 * Updates Plan and syncs with backend database
 */
function changeExistingPlan(newName, newPrice) {
    fetch('/api/update_plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: appState.userId, new_plan: newName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            appState.selectedPlanName = newName;
            appState.selectedPlanPrice = newPrice;
            updateDashboardUI();
            showBanner(`Your plan has been updated to the ${newName}!`, "success");
        } else {
            showBanner("Plan update error: " + data.message, "error");
        }
    })
    .catch(() => {
        // Fallback for standalone frontend testing
        appState.selectedPlanName = newName;
        appState.selectedPlanPrice = newPrice;
        updateDashboardUI();
        showBanner(`Your plan has been updated to the ${newName}!`, "success");
    });
}

function renderSavedCardUI() {
    const cardDisplay = document.getElementById('saved-card-display');
    const formDisplay = document.getElementById('no-saved-card-display');

    if (appState.savedCard) {
        cardDisplay.classList.remove('hidden');
        formDisplay.classList.add('hidden');
        document.getElementById('saved-card-num').textContent = `•••• •••• •••• ${appState.savedCard.card_last_four}`;
        document.getElementById('saved-card-exp').textContent = appState.savedCard.expiry;
    } else {
        cardDisplay.classList.add('hidden');
        formDisplay.classList.remove('hidden');
        document.getElementById('save-card-form').reset();
    }
}

function handleSaveCard(event) {
    event.preventDefault();

    const cardNumber = document.getElementById('save-card-num-input').value.trim();
    const expiry = document.getElementById('save-card-exp-input').value.trim();
    const cvc = document.getElementById('save-card-cvc-input').value.trim();

    fetch('/save-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: appState.userId,
            card_number: cardNumber,
            expiry: expiry,
            cvc: cvc
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showBanner(data.message || "Payment card saved successfully.", "success");
            appState.savedCard = {
                card_last_four: cardNumber.slice(-4),
                expiry: expiry,
                token: data.token || 'saved_token'
            };
            renderSavedCardUI();
        } else {
            showBanner("Save Error: " + data.message, "error");
        }
    })
    .catch(err => {
        console.error("Error saving card:", err);
        showBanner("Network error saving card.", "error");
    });
}

function deleteSavedCard() {
    if (!confirm("Are you sure you want to delete this saved card?")) return;

    fetch('/delete-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: appState.userId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showBanner(data.message || "Saved payment card removed.", "success");
            appState.savedCard = null;
            renderSavedCardUI();
        } else {
            showBanner("Deletion Error: " + data.message, "error");
        }
    })
    .catch(err => {
        console.error(err);
        showBanner("Network error deleting saved card.", "error");
    });
}

function handleProfileUpdate(event) {
    event.preventDefault();
    
    const form = document.getElementById('editProfileForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    fetch('/api/update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.status === 'success') {
            switchTab('dashboard');
            showBanner('Your profile has been updated successfully.', 'success');
        } else {
            showBanner('Error updating profile: ' + result.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error updating profile:', error);
        showBanner('Network error updating profile.', 'error');
    });
}



function loadAndEditProfile() {
    fetch('/api/get_profile')
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            document.getElementById('edit-fname').value = data.user.first_name || '';
            document.getElementById('edit-lname').value = data.user.last_name || '';
            document.getElementById('edit-dob').value = data.user.dob || '';
            document.getElementById('edit-email').value = data.user.email || '';
            document.getElementById('edit-phone').value = data.user.phone || '';
            document.getElementById('edit-address').value = data.user.address || '';
            
            switchTab('edit-profile');
        } else {
            showBanner('Error loading profile data: ' + data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error fetching profile:', error);
        showBanner('Network error loading profile.', 'error');
    });
}

/* ==========================================================================
   CSP Security Event Initializer (Replaces all inline onclick/onsubmit)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Navigation Tab Buttons & CTA Buttons
    document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    // 2. Plan Selection Buttons
    document.querySelectorAll('[data-plan-name]').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-plan-name');
            const price = Number(btn.getAttribute('data-plan-price'));
            selectPlan(name, price);
        });
    });

    // 3. Dashboard Action Buttons
    document.getElementById('switch-basic-btn')?.addEventListener('click', () => changeExistingPlan('Basic Plan', 39));
    document.getElementById('switch-ultra-btn')?.addEventListener('click', () => changeExistingPlan('Ultra Plan', 59));
    document.getElementById('switch-giga-btn')?.addEventListener('click', () => changeExistingPlan('Giga Plan', 79));
    document.getElementById('remove-card-btn')?.addEventListener('click', deleteSavedCard);
    document.getElementById('edit-profile-btn')?.addEventListener('click', loadAndEditProfile);

    // 4. Form Submissions
    const forms = [
        { id: 'signup-form', handler: handleSignUp },
        { id: 'verify-form', handler: handleVerify },
        { id: 'login-form', handler: handleLogin },
        { id: 'mfa-form', handler: handleMfaVerify },
        { id: 'save-card-form', handler: handleSaveCard },
        { id: 'payment-form', handler: handlePayment },
        { id: 'editProfileForm', handler: handleProfileUpdate }
    ];

    forms.forEach(({ id, handler }) => {
        const form = document.getElementById(id);
        if (form) form.addEventListener('submit', handler);
    });

    // 💾 5. Session & Tab Restoration on Page Reload
    const storedSession = localStorage.getItem('sessionData');
    const hashTab = window.location.hash.replace('#', '');
    const storedTab = hashTab || localStorage.getItem('activeTab') || 'home';

    if (storedSession) {
        try {
            const parsedSession = JSON.parse(storedSession);
            restoreSession(parsedSession);

            switchTab(storedTab, false);
        } catch (e) {
            console.error("Session restore failed", e);
            localStorage.removeItem('sessionData');
            switchTab('home', false);
        }
    } else {
        // If not logged in, prevent landing on protected tabs
        if (storedTab === 'dashboard' || storedTab === 'edit-profile') {
            switchTab('home', false);
        } else {
            switchTab(storedTab, false);
        }
    }

    // Replace the current history state so the starting page has a valid state object
    history.replaceState({ tabId: storedTab }, '', `#${storedTab}`);
});

/**
 * Restores user state & dashboard UI from local storage after page reload
 */
function restoreSession(savedData) {
    appState.userLoggedIn = true;
    appState.hasSubscription = true;
    appState.userId = savedData.user.id;
    appState.selectedPlanName = savedData.user.selected_plan || 'Basic Plan';
    appState.savedCard = savedData.payment;

    if (appState.selectedPlanName === 'Ultra Plan') {
        appState.selectedPlanPrice = 59;
    } else if (appState.selectedPlanName === 'Giga Plan') {
        appState.selectedPlanPrice = 79;
    } else {
        appState.selectedPlanPrice = 39;
    }

    renderDatabaseBills(savedData.bills || []);
    renderSavedCardUI();

    const userFullName = `${savedData.user.first_name} ${savedData.user.last_name}`;
    document.getElementById('dash-greeting-title').textContent = `Great to see you, ${userFullName}!`;
    document.getElementById('dash-plan-status').textContent = `Your internet profile is active at $${appState.selectedPlanPrice}/month.`;
    
    // Reveal Dashboard navigation button
    document.getElementById('nav-dashboard').classList.remove('hidden');
}

/* ==========================================================================
   Browser Back/Forward Button Navigation Handler
   ========================================================================== */
window.addEventListener('popstate', (event) => {
    let targetTab = 'home';

    if (event.state && event.state.tabId) {
        targetTab = event.state.tabId;
    } else if (window.location.hash) {
        targetTab = window.location.hash.replace('#', '');
    }

    // Switch tab WITHOUT pushing duplicate state to history stack (false)
    switchTab(targetTab, false);
});