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
 */
function showBanner(message, type = 'info', targetContainer = null) {
    setTimeout(() => {
        let banner = null;

        if (targetContainer) {
            banner = targetContainer.querySelector('.status-banner');
        }

        if (!banner) {
            banner = document.querySelector('.status-banner');
        }

        if (!banner) return;

        banner.className = `status-banner ${type}`;
        banner.textContent = message;
        banner.classList.remove('hidden');

        setTimeout(() => {
            banner.classList.add('hidden');
        }, 5000);
    }, 50);
}

/**
 * Create Account workflow: Step 1 - Choose Package Selection
 */
function selectPlan(planName, price) {
    appState.selectedPlanName = planName;
    appState.selectedPlanPrice = price;

    const formTitle = document.getElementById('selected-plan-title');
    const signupForm = document.getElementById('signup-form');

    if(formTitle) formTitle.textContent = `Signing up for: ${planName} ($${price}/mo)`;
    if(signupForm) {
        signupForm.classList.remove('hidden');
        signupForm.scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * Create Account workflow: Step 2 - Validation + Live Database Submission
 */
async function handleSignUp(event) {
    event.preventDefault();

    const phoneInput = document.getElementById('reg-phone').value.trim();
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
        
        // This handles the server returning a 400 or 500 error before parsing JSON
        if (!response.ok && response.status !== 400 && response.status !== 201) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();  

        if (result.status === 'success') {
            // 1. Hide signup form
            signupForm.classList.add('hidden');
            
            // 2. Hide the main title, subtitle, and pricing cards to clean up the UI
            const mainTitle = document.querySelector('.tab-content > h2');
            const subtitle = document.querySelector('.subtitle');
            const pricingContainer = document.querySelector('.pricing-container');
            
            if (mainTitle) mainTitle.classList.add('hidden');
            if (subtitle) subtitle.classList.add('hidden');
            if (pricingContainer) pricingContainer.classList.add('hidden');
            
            // 3. Show verification form
            const verifySection = document.getElementById('verify-section');
            if(verifySection) {
                verifySection.classList.remove('hidden');
            }
            
            // 4. Show the success banner
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
            // Redirect to login page upon successful verification with message flag
            window.location.href = '/login?msg=registered'; 
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
            // Append the msg parameter to whatever URL the backend provides
            const separator = data.redirect.includes('?') ? '&' : '?';
            window.location.href = data.redirect + separator + 'msg=login_success'; 
            return;
        }

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
            localStorage.setItem('sessionData', JSON.stringify(data));
            // Redirect to dashboard on successful MFA with message flag
            window.location.href = '/dashboard?msg=login_success'; 
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
    if (!billListContainer) return; // Prevent errors if not on dashboard
    
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
    const planNameEl = document.getElementById('dash-plan-name');
    if (planNameEl) planNameEl.textContent = appState.selectedPlanName;
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
        showBanner("Network error updating plan.", "error");
    });
}

function renderSavedCardUI() {
    const cardDisplay = document.getElementById('saved-card-display');
    const formDisplay = document.getElementById('no-saved-card-display');
    
    if (!cardDisplay || !formDisplay) return;

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
            // ✅ Redirect immediately to the dashboard with the message flag
            window.location.href = '/dashboard?msg=profile_updated';
        } else {
            showBanner('Error updating profile: ' + result.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error updating profile:', error);
        showBanner('Network error updating profile.', 'error');
    });
}

/**
 * Safely log the user out, destroy server session, clear local state, and return to login
 */
async function handleLogout(event) {
    if (event) event.preventDefault();

    try {
        await fetch('/api/logout', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error("Error communicating with logout server:", error);
    }

    localStorage.removeItem('sessionData');
    
    // Redirect to login page with message flag
    window.location.href = '/login?msg=logged_out';
}

/* ==========================================================================
   DOM Initializer 
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // URL Check for banners
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('expired')) {
        showBanner("Session expired, please log in again.", "info");
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (urlParams.has('msg')) {
        const msg = urlParams.get('msg');
        if (msg === 'registered') {
            showBanner("Account created successfully! Please log in.", "success");
        } else if (msg === 'login_success') {
            showBanner("Login successful!", "success");
        } else if (msg === 'logged_out') {
            showBanner("Logout successful!", "success");
        } else if (msg === 'profile_updated') {
            // ✅ Catch the profile update flag and show the banner
            showBanner("Profile updated successfully!", "success");
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 1. Plan Selection Buttons
    document.querySelectorAll('[data-plan-name]').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-plan-name');
            const price = Number(btn.getAttribute('data-plan-price'));
            selectPlan(name, price);
        });
    });

    // 2. Action Buttons
    document.getElementById('switch-basic-btn')?.addEventListener('click', () => changeExistingPlan('Basic Plan', 39));
    document.getElementById('switch-ultra-btn')?.addEventListener('click', () => changeExistingPlan('Ultra Plan', 59));
    document.getElementById('switch-giga-btn')?.addEventListener('click', () => changeExistingPlan('Giga Plan', 79));
    document.getElementById('remove-card-btn')?.addEventListener('click', deleteSavedCard);
    document.getElementById('edit-profile-btn')?.addEventListener('click', () => window.location.href = '/edit-profile');
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

    // 3. Form Submissions
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

    // 💾 4. Restore frontend state strictly for the Dashboard rendering
    const storedSession = localStorage.getItem('sessionData');
    if (storedSession) {
        try {
            const savedData = JSON.parse(storedSession);
            appState.userLoggedIn = true;
            appState.userId = savedData.user.id;
            appState.selectedPlanName = savedData.user.selected_plan || 'Basic Plan';
            appState.savedCard = savedData.payment;
            
            // If we are on the dashboard, this populates the bills
            if(document.getElementById('dash-bill-list')) {
                 renderDatabaseBills(savedData.bills || []);
                 renderSavedCardUI();
            }
        } catch (e) {
            console.error("Session restore failed", e);
            localStorage.removeItem('sessionData');
        }
    }
});