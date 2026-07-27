// Global Application State tracking
let appState = {
    userLoggedIn: false,
    selectedPlanName: 'Basic Plan',
    selectedPlanPrice: 39,
    hasSubscription: false,
    activeBillElement: null,
    selectedBillId: null,  // Tracks active MySQL ID for payment transactions
    savedCard: null,           // 🌟 ADD THIS: Track if card token exists
    useToken: false            // 🌟 ADD THIS: Check whether checkout routes via Token
};


/**
 * Handles Global Tab Switching Mechanics
 */
/**
 * Handles Global Tab Switching Mechanics Safely
 */
function switchTab(tabId) {
    // 1. Hide all tabs safely
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        if (tab) tab.classList.remove('active');
    });

    // 2. Deactivate all nav styling
    const navButtons = document.querySelectorAll('.nav-btn, button');
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

    // 4. Safely match the highlighted button style
    navButtons.forEach(btn => {
        try {
            const onClickAttr = btn.getAttribute('onclick');
            if (onClickAttr && typeof onClickAttr === 'string' && onClickAttr.includes(`'${tabId}'`)) {
                btn.classList.add('active');
            }
        } catch (e) {
            // Silently ignore elements that don't support getAttribute
        }
    });
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
    event.preventDefault(); // Stop page reload

    // 1. Grab input field values for front-end validation check
    const firstName = document.getElementById('reg-fname').value.trim();
    const lastName = document.getElementById('reg-lname').value.trim();
    const phoneInput = document.getElementById('reg-phone').value.trim();

    // 2. Enforce valid Belgian phone numbers
    const belgianPhoneRegex = /^(?:\+32\s?|0)[1-9](?:\s?\d){7,8}$/;
    if (!belgianPhoneRegex.test(phoneInput)) {
        alert("Registration Error: Please enter a valid Belgian phone number format (e.g., 0470 12 34 56).");
        return; 
    }

    // 3. Prepare Form Data (including dynamic selected plan)
    const signupForm = document.getElementById('signup-form');
    const formData = new FormData(signupForm);
    formData.append('selected-plan', appState.selectedPlanName);

    // 4. Send single network request to Flask Backend
    try {
        const response = await fetch('/register', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();  

        if (result.status === 'success') {
    alert(result.message);

    // Remove hidden class and cleanly switch active tab focus
    document.getElementById('verify-tab').classList.remove('hidden');
    switchTab('verify'); 
                    }
         else {
            // Captures backend validation errors (e.g., weak password, duplicate email)
            alert("Registration Failure: " + result.message);
        }  
    } catch (error) {
        console.error("Network connectivity error:", error);
        alert("Network Error: Could not connect to the backend server. Make sure Flask is running.");
    }
}

// create account verification function
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

    // Hide verification tab and switch directly to the Login tab
    document.getElementById('verify-tab').classList.add('hidden');
    switchTab('login');
        }
         else {
            alert("Verification Failure: " + data.message);
        }
    })
    .catch(error => {
        console.error("Network connectivity error:", error);
        alert("Network Error: Could not connect to the verification server.");
    });
}




/**
 * Real Database Customer Authentication & Dynamic Dashboard Loader
 */

function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'mfa_required') {
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('mfa-container').style.display = 'block';
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
        headers: {
            'Content-Type': 'application/json'
        },
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

            renderDatabaseBills(data.bills);
            renderSavedCardUI();

            document.getElementById('dash-plan-name').textContent = appState.selectedPlanName;
            document.getElementById('dash-plan-status').textContent = `Welcome back, ${data.user.first_name} ${data.user.last_name}! Your high-speed internet profile is active at $${appState.selectedPlanPrice}/month.`;
            
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
    billListContainer.innerHTML = ''; // Wipe whatever was there clean

    if (bills.length === 0) {
        billListContainer.innerHTML = '<li style="text-align: center; color: #718096; padding: 15px;">No bills generated for this account yet.</li>';
        return;
    }

    bills.forEach(bill => {
        const li = document.createElement('li');
        li.id = `bill-${bill.id}`; // Label using its unique database Auto-Increment ID!
        
        const statusClass = bill.status === 'paid' ? 'paid' : 'unpaid';
        const capitalizedStatus = bill.status.charAt(0).toUpperCase() + bill.status.slice(1);

        li.innerHTML = `
            <span>${bill.billing_period} Statement ($${Number(bill.amount).toFixed(2)})</span>
            <span class="bill-status ${statusClass}">${capitalizedStatus}</span>
        `;
        
        // When clicked, handle its state
        li.onclick = function() {
            selectDatabaseBill(li, bill);
        };
        
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
    
    // 🌟 Check if we can check out using the saved card token
    if (appState.savedCard) {
        document.getElementById('card-num').value = `•••• •••• •••• ${appState.savedCard.card_last_four}`;
        document.getElementById('card-exp').value = appState.savedCard.expiry;
        document.getElementById('card-cvc').value = '•••';
        
        document.getElementById('card-num').disabled = true;
        document.getElementById('card-exp').disabled = true;
        document.getElementById('card-cvc').disabled = true;
        
        appState.useToken = true;
    } else {
        document.getElementById('card-num').value = '';
        document.getElementById('card-exp').value = '';
        document.getElementById('card-cvc').value = '';
        
        document.getElementById('card-num').disabled = false;
        document.getElementById('card-exp').disabled = false;
        document.getElementById('card-cvc').disabled = false;
        
        appState.useToken = false;
    }

    paymentBox.classList.remove('hidden');
    paymentBox.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Processes simulated credit card security verification and UPDATES MySQL!
 */
function handlePayment(event) {
    event.preventDefault();
    
    if (!appState.selectedBillId) {
        alert("Payment Error: No statement selected.");
        return;
    }

    const payload = { bill_id: appState.selectedBillId };

    // 🌟 Route the safe token if applicable, otherwise send raw form inputs
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
/**
 * Updates UI details regarding active subscription costs
 */
function updateDashboardUI() {
    document.getElementById('dash-plan-name').textContent = appState.selectedPlanName;
}

/**
 * Utility function to quickly toggle selected package tiers
 */
function changeExistingPlan(newName, newPrice) {
    appState.selectedPlanName = newName;
    appState.selectedPlanPrice = newPrice;
    updateDashboardUI();
    alert(`Your plan has been instantly updated to the ${newName}!`);
}

/***
 * This section adds cards and remove them with the tokens 
 */
  
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
            alert(data.message);
            // Quick force-reload to synchronize token state cleanly with database
            location.reload(); 
        } else {
            alert("Save Error: " + data.message);
        }
    })
    .catch(err => console.error("Error tokenizing card:", err));
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
    event.preventDefault(); // Prevents the page from reloading
    
    // Gather all data from the form
    const form = document.getElementById('editProfileForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Send to Flask Backend
    fetch('/api/update_profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.status === 'success') {
            alert('Your profile has been updated successfully.');
            switchTab('dashboard-tab'); // Route user back to dashboard
            location.reload(); // Optional: reload to refresh the dashboard names/data
        } else {
            alert('Error updating profile: ' + result.message);
        }
    })
    .catch(error => console.error('Error:', error));
}

function loadAndEditProfile() {
    // Fetch current user data from the backend
    fetch('/api/get_profile')
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Populate the form fields with the retrieved data
            document.getElementById('edit-fname').value = data.user.first_name;
            document.getElementById('edit-lname').value = data.user.last_name;
            document.getElementById('edit-dob').value = data.user.dob;
            document.getElementById('edit-email').value = data.user.email;
            document.getElementById('edit-phone').value = data.user.phone;
            document.getElementById('edit-address').value = data.user.address;
            
            // Switch to the edit profile tab
            switchTab('edit-profile');
        } else {
            alert('Error loading profile data: ' + data.message);
        }
    })
    .catch(error => console.error('Error fetching profile:', error));
}