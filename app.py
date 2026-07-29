from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for, render_template
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import pymysql
# 🌟 Added check_password_hash here
from werkzeug.security import generate_password_hash, check_password_hash
import base64
import smtplib
from email.message import EmailMessage
import os
import secrets
from dotenv import load_dotenv
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")

load_dotenv() # Loads variables from .env

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")

COMMON_WEAK_PASSWORDS = {"password123", "123456789012", "qwertyuiop12", "admin1234567", "123456", "qwerty", "12345", "qwerty123"}

#password validation function
def validate_password(password: str, username: str = "") -> tuple[bool, str]:
    if not password or len(password) < 12:
        return False, "Password must be at least 12 characters long."
    
    if len(password) > 128:
        return False, "Password is too long (maximum 128 characters)."
    
    if password.lower() in COMMON_WEAK_PASSWORDS:
        return False, "This password is too weak. Please choose a stronger password."
        
    if username and username.lower() in password.lower():
        return False, "Password cannot contain your email."

    return True, "Password meets requirements."

#email verification function
def get_user_otp_from_db(email):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT registration_otp FROM users WHERE email = %s", (email,))
            result = cursor.fetchone()
        connection.close()
        
        if result:
            # Handles both Dictionary cursors (dict) and Standard cursors (tuple)
            return result['registration_otp'] if isinstance(result, dict) else result[0]
        return None
    except Exception as e:
        print(f"❌ Error fetching OTP from DB: {e}")
        return None

#login verification function
def send_mfa_email(recipient_email, code):
    msg = EmailMessage()
    msg.set_content(f"Your Netify verification code is: {code}\nThis code expires in 5 minutes.")
    msg['Subject'] = "Netify Security - Login Verification Code"
    msg['From'] = SENDER_EMAIL
    msg['To'] = recipient_email

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)

app.secret_key = os.getenv("FLASK_SECRET_KEY")

# Initialize the Rate Limiter
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# =====================================================================
# 🛡️ SENSITIVE FILE PROTECTION (PREVENTS .env & .git LEAKS)
# =====================================================================
BLOCKED_EXTENSIONS = {'.env', '.git', '.ini', '.py', '.sql', '.db', '.log', '.md'}

@app.before_request
def protect_sensitive_files():
    from flask import abort
    # 1. Block dotfiles and hidden directories (e.g., /.env, /.git/config)
    if any(part.startswith('.') for part in request.path.split('/') if part):
        abort(404)
    
    # 2. Block sensitive file extensions
    if any(request.path.lower().endswith(ext) for ext in BLOCKED_EXTENSIONS):
        abort(404)

def get_db_connection():
    return pymysql.connect(
        host='localhost',
        user=os.getenv("DB_USER"),             
        password=os.getenv("DB_PASSWORD"),  
        database=os.getenv("DB_NAME"),
        cursorclass=pymysql.cursors.DictCursor
    )

# 🔐 MOCK VAULT ENCRYPTION HELPERS
def encrypt_card(card_number):
    bytes_card = card_number.encode('utf-8')
    return base64.b64encode(bytes_card).decode('utf-8')

def decrypt_card(encrypted_str):
    try:
        return base64.b64decode(encrypted_str.encode('utf-8')).decode('utf-8')
    except Exception:
        return "DECRYPTION_ERROR"

@app.after_request
def add_security_headers(response):
    # Prevent Clickjacking
    response.headers["X-Frame-Options"] = "SAMEORIGIN"

    # Prevent MIME-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"

    # Complete Content Security Policy (resolves ZAP warnings)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "frame-ancestors 'self'; "
        "form-action 'self';"
    )

    # Protect privacy on outgoing links
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Disable unused hardware API access
    response.headers["Permissions-Policy"] = (
        "geolocation=(), microphone=(), camera=()"
    )

    # Mask application server signature
    response.headers["Server"] = "Netify Server"

    return response

@app.route('/')
def home():
    return render_template('index.html')

# 1. REGISTRATION ROUTE
@app.route('/register', methods=['POST'])
def register():
    first_name = request.form.get('reg-fname')
    last_name = request.form.get('reg-lname')
    dob = request.form.get('reg-dob')
    email = request.form.get('reg-email')
    phone = request.form.get('reg-phone')
    plain_password = request.form.get('reg-password') or ""
    address = request.form.get('reg-address')
    plan = request.form.get('selected-plan')

    # 1. CALL THE VALIDATION FUNCTION HERE
    is_valid, error_message = validate_password(plain_password, username=email)
    
    # 2. IF INVALID, STOP & RETURN ERROR TO USER
    if not is_valid:
        return jsonify({"status": "error", "message": error_message}), 400

    # 3. IF VALID, CONTINUE TO HASH & SAVE TO DATABASE
    hashed_password = generate_password_hash(plain_password, method='scrypt')

        # Generates a cryptographically secure 6-digit code (100000 - 999999)
    otp_code = str(secrets.randbelow(900000) + 100000)

    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            query = """
                INSERT INTO users (first_name, last_name, date_of_birth, email, phone_number, password_hash, street_address, selected_plan, is_verified, registration_otp)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(query, (first_name, last_name, dob, email, phone, hashed_password, address, plan, False, otp_code))
        connection.commit()
        connection.close()

        #send verification code
        send_mfa_email(email, f"Your verification code is: {otp_code}")
        session['pending_verification_email'] = email

        return jsonify({"status": "success", "message": "A verification code has been sent to your email. Please enter it.", "redirect": url_for('verify_registration')}), 201
    except Exception as e:
        print(f"\n❌ DATABASE REGISTRATION ERROR: {e}\n")
        return jsonify({"status": "error", "message": f"Database error: {str(e)}"}), 400
    
#account creation verification
@app.route('/verify-registration', methods=['POST'])
def verify_registration():
    otp_input = request.form.get('otp_code')
    email = session.get('pending_verification_email')

    if not email:
        return jsonify({"status": "error", "message": "Session expired. Please try registering again."}), 400

    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # Check if OTP matches
            cursor.execute("SELECT registration_otp FROM users WHERE email = %s", (email,))
            user = cursor.fetchone()

            # Note: adjust 'registration_otp' dictionary/tuple key depending on your database cursor settings
            if user and user.get('registration_otp') == otp_input: 
                # Mark user as verified and clear OTP
                cursor.execute("""
                    UPDATE users 
                    SET is_verified = 1, registration_otp = NULL 
                    WHERE email = %s
                """, (email,))
                connection.commit()
                connection.close()

                # Clear pending session variable
                session.pop('pending_verification_email', None)

                # 🌟 RETURN JSON HERE (Do NOT use redirect())
                return jsonify({
                    "status": "success", 
                    "message": "Email verified successfully! You can now log in."
                }), 200
            else:
                connection.close()
                return jsonify({"status": "error", "message": "Invalid or expired verification code."}), 400

    except Exception as e:
        print(f"\n❌ VERIFICATION ERROR: {e}\n")
        return jsonify({"status": "error", "message": f"Database error: {str(e)}"}), 400   

#login route
@app.route('/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()

        #forces account creation verification before logging in
        if not user['is_verified']:
            return "Please verify your email address before logging in.", 403

        # Validate credentials using password_hash
        if user and check_password_hash(user['password_hash'], password):
            mfa_code = str(secrets.randbelow(900000) + 100000)
            mfa_expiry = datetime.now() + timedelta(minutes=5)

            cursor.execute(
                "UPDATE users SET mfa_code = %s, mfa_expiry = %s WHERE id = %s", 
                (mfa_code, mfa_expiry, user['id'])
            )
            conn.commit()

            send_mfa_email(user['email'], mfa_code)
            session['temp_user_id'] = user['id']  # Track user temporarily for MFA check

            return jsonify({'status': 'mfa_required', 'message': 'Verification code sent to email.'})
        
        return jsonify({'status': 'error', 'message': 'Invalid email or password.'})
    finally:
        cursor.close()
        conn.close()

#MFA Route
@app.route('/verify-mfa', methods=['POST'])
@limiter.limit("5 per minute")
def verify_mfa():
    data = request.get_json()
    entered_code = data.get('code')
    
    user_id = session.get('temp_user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Session expired. Please log in again."}), 401

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({"status": "error", "message": "User not found."}), 404

        stored_code = user.get('mfa_code')
        mfa_expiry = user.get('mfa_expiry')
        
        code_is_valid = (str(stored_code) == str(entered_code))
        not_expired = mfa_expiry and datetime.now() < mfa_expiry

        if code_is_valid and not_expired:
            session.pop('temp_user_id', None)
            session['user_id'] = user['id']
            
            # Fetch user's billing statements
            cursor.execute("SELECT * FROM bills WHERE user_id = %s", (user['id'],))
            bills = cursor.fetchall()
            
            # Updated to match your actual database table name!
            cursor.execute("SELECT * FROM payment_details WHERE user_id = %s", (user['id'],))
            saved_payment = cursor.fetchone()

            return jsonify({
                "status": "success",
                "message": "Verification successful!",
                "user": {
                    "id": user['id'],
                    "first_name": user['first_name'],
                    "last_name": user['last_name'],
                    "email": user['email'],
                    "selected_plan": user.get('selected_plan', 'Basic Plan')
                },
                "bills": bills if bills else [],
                "payment": saved_payment if saved_payment else None
            })
        else:
            return jsonify({"status": "error", "message": "Invalid or expired verification code."}), 400
    finally:
        cursor.close()
        conn.close()

# 3. NEW BILL PAYMENT ROUTE: Safely updates unpaid bills to 'paid' in MySQL
@app.route('/pay-bill', methods=['POST'])
def pay_bill():
    data = request.get_json()
    bill_id = data.get('bill_id')
    token = data.get('token')  # Received if checking out with a saved token

    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            if token:
                # 🌟 TOKENIZED TRANSACTION
                vault_query = "SELECT encrypted_card_number, expiry, cvc FROM payment_vault WHERE token = %s"
                cursor.execute(vault_query, (token,))
                vault_card = cursor.fetchone()

                if not vault_card:
                    connection.close()
                    return jsonify({"status": "error", "message": "Invalid payment token"}), 400

                # Decrypt elements inside backend to complete simulated charge
                decrypted_card = decrypt_card(vault_card['encrypted_card_number'])
                print(f"\n🔐 [Vault Decryption Success] Charging Token: {token}")
                print(f"💳 Card Sent to Bank: {decrypted_card[-4:]} | Exp: {vault_card['expiry']} | CVC: {vault_card['cvc']}\n")
            else:
                print(f"\n💳 [Raw Transaction] Charging manual credit card entries.\n")

            # Mark bill as paid
            query = "UPDATE bills SET status = 'paid' WHERE id = %s"
            cursor.execute(query, (bill_id,))
            
        connection.commit()
        connection.close()
        return jsonify({"status": "success", "message": "Bill marked as Paid!"}), 200
    except Exception as e:
        print(f"\n❌ DATABASE PAYMENT CRASH: {e}\n")
        return jsonify({"status": "error", "message": f"Database error: {str(e)}"}), 500
    
@app.route('/save-payment', methods=['POST'])
def save_payment():
    data = request.get_json()
    user_id = data.get('user_id')
    card_number = data.get('card_number')
    expiry = data.get('expiry')
    cvc = data.get('cvc')

    clean_card = card_number.replace(" ", "")
    last_four = clean_card[-4:]

    # Generate a secure transaction Token and encrypt the real card payload
    token = f"tok_{secrets.token_hex(8)}"
    encrypted_card = encrypt_card(clean_card)

    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # 1. Write the sensitive data to the secure payment_vault
            vault_query = """
                INSERT INTO payment_vault (token, encrypted_card_number, expiry, cvc)
                VALUES (%s, %s, %s, %s)
            """
            cursor.execute(vault_query, (token, encrypted_card, expiry, cvc))

            # 2. Save ONLY the harmless reference token to payment_details
            details_query = """
                INSERT INTO payment_details (user_id, token, card_last_four, expiry)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE token = VALUES(token), card_last_four = VALUES(card_last_four), expiry = VALUES(expiry)
            """
            cursor.execute(details_query, (user_id, token, last_four, expiry))

        connection.commit()
        connection.close()
        return jsonify({"status": "success", "message": "Card successfully tokenized and stored!"}), 200
    except Exception as e:
        print(f"\n❌ DATABASE SAVE PAYMENT CRASH: {e}\n")
        return jsonify({"status": "error", "message": f"Database error: {str(e)}"}), 500

@app.route('/delete-payment', methods=['POST'])
def delete_payment():
    data = request.get_json()
    user_id = data.get('user_id')

    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            token_query = "SELECT token FROM payment_details WHERE user_id = %s" # nosec B105
            cursor.execute(token_query, (user_id,))
            record = cursor.fetchone()

            if record:
                token = record['token']
                cursor.execute("DELETE FROM payment_vault WHERE token = %s", (token,))
                cursor.execute("DELETE FROM payment_details WHERE user_id = %s", (user_id,))

        connection.commit()
        connection.close()
        return jsonify({"status": "success", "message": "Saved card removed successfully."}), 200
    except Exception as e:
        print(f"\n❌ DATABASE DELETE PAYMENT CRASH: {e}\n")
        return jsonify({"status": "error", "message": f"Database error: {str(e)}"}), 500


@app.route('/api/update_profile', methods=['POST'])
def update_profile():
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
        
    user_id = session['user_id']
    data = request.json
    
    # Use your established connection function
    connection = get_db_connection()
    cursor = connection.cursor()
    
    try:
        query = """
            UPDATE users 
            SET first_name = %s, last_name = %s, date_of_birth = %s, email = %s, phone_number = %s, street_address = %s 
            WHERE id = %s
        """
        values = (
            data['first_name'], data['last_name'], data['dob'], 
            data['email'], data['phone'], data['address'], user_id
        )
        cursor.execute(query, values)
        
        if data.get('password') and data['password'].strip() != '':
            hashed_pw = generate_password_hash(data['password'], method='scrypt')
            pw_query = "UPDATE users SET password_hash = %s WHERE id = %s"
            cursor.execute(pw_query, (hashed_pw, user_id))
            
        connection.commit()
        return jsonify({'status': 'success', 'message': 'Profile updated.'})
        
    except Exception as e:
        connection.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
        
    finally:
        cursor.close()
        connection.close()


@app.route('/api/get_profile', methods=['GET'])
def get_profile():
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
        
    user_id = session['user_id']
    # Use your established connection function
    connection = get_db_connection()
    cursor = connection.cursor()
    
    try:
        query = "SELECT first_name, last_name, date_of_birth, email, phone_number, street_address FROM users WHERE id = %s"
        cursor.execute(query, (user_id,))
        user = cursor.fetchone()
        
        if user:
            # Since you use DictCursor in get_db_connection(), you can access by name directly!
            user_data = {
                'first_name': user['first_name'],
                'last_name': user['last_name'],
                'dob': str(user['date_of_birth']),
                'email': user['email'],
                'phone': user['phone_number'],
                'address': user['street_address']
            }
            return jsonify({'status': 'success', 'user': user_data})
        else:
            return jsonify({'status': 'error', 'message': 'User not found'}), 404
            
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
        
    finally:
        cursor.close()
        connection.close()

if __name__ == '__main__':
    is_debug = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1")
    app.run(debug=is_debug)