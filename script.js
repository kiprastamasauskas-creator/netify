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
 * Handles Global Tab Switching Mechanics Safely
 */
function switchTab(tabId) {
    // 1. Hide all tabs safely
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        if (tab) tab.classList.remove('active');
    });

    // 2. Deactivate only navbar button styling
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
        alert("Registration Error: Please enter a valid Belgian phone number format (e.g., 0470 12 34 56).");
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
            alert(result.message);
            document.getElementById('verify-tab').classList.remove('hidden');
            switchTab('verify'); 
        } else {
            alert("Registration Failure: " + result.message);
        }   
    } catch (error) {
        console.error("Network connectivity error:", error);
        alert("Network Error: Could not connect to the backend server.");
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
            alert(data.message);
            verifyForm.reset();
            document.getElementById('verify-tab').classList.add('hidden');
            switchTab('login');
        } else {
            alert("Verification Failure: " + data.message);
        }
    })
    .catch(error => {
        console.error("Network connectivity error:", error);
        alert("Network Error: Could not connect to the verification server.");
    });
}

/**
 * Real Database Customer Authentication & MFA Step
 */
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
        if (data.status === 'mfa_required') {
            document.getElementById('login-container').classList.add('hidden');
            document.getElementById('mfa-container').classList.remove('hidden');
        } else {
            alert("Login Failure: " + data.message);
        }
    })
    .catch(error => {
        console.error("Network connectivity error:", error);
        alert("Network Error: Could not connect to the authentication server.");
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
            alert(data.message);
            
            appState.userLoggedIn = true;
            appState.hasSubscription = true;
            appState.userId = data.user.id;
            appState.selectedPlanName = data.user.selected_plan || 'Basic Plan';
            appState.savedCard = data.payment;

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
            document.getElementById('dash-plan-status').textContent = `Welcome back, ${data.user.first_name} ${data.user.last_name}! Your internet profile is active at $${appState.selectedPlanPrice}/month.`;
            
            document.getElementById('nav-dashboard').classList.remove('hidden');
            switchTab('dashboard');
        } else {
            alert("Verification Failure: " + data.message);
        }
    })
    .catch(error => {
        console.error("Network connectivity error:", error);
        alert("Network Error: Could not connect to the verification server.");
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
        alert("This invoice has already been fully paid.");
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
        alert("Payment Error: No statement selected.");
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
            alert("Payment Approved!");
            
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
            alert("Database Payment Error: " + data.message);
        }
    })
    .catch(error => {
        console.error(error);
        alert("Network Error processing payment.");
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
            alert(`Your plan has been updated to the ${newName}!`);
        } else {
            alert("Plan update error: " + data.message);
        }
    })
    .catch(() => {
        // Fallback for standalone frontend testing
        appState.selectedPlanName = newName;
        appState.selectedPlanPrice = newPrice;
        updateDashboardUI();
        alert(`Your plan has been updated to the ${newName}!`);
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
        cardDisplay.classList.remove('hidden'); // Ensure container displays correctly
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
            alert(data.message);
            appState.savedCard = {
                card_last_four: cardNumber.slice(-4),
                expiry: expiry,
                token: data.token || 'saved_token'
            };
            renderSavedCardUI();
        } else {
            alert("Save Error: " + data.message);
        }
    })
    .catch(err => console.error("Error saving card:", err));
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
            alert(data.message);
            appState.savedCard = null;
            renderSavedCardUI();
        } else {
            alert("Deletion Error: " + data.message);
        }
    })
    .catch(err => console.error(err));
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
            alert('Your profile has been updated successfully.');
            switchTab('dashboard');
        } else {
            alert('Error updating profile: ' + result.message);
        }
    })
    .catch(error => console.error('Error updating profile:', error));
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
            alert('Error loading profile data: ' + data.message);
        }
    })
    .catch(error => console.error('Error fetching profile:', error));
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
});