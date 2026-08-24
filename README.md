# Netify Project Brief: An Internet Service Provider (ISP) Web Application

<img width="912" height="327" alt="image" src="https://github.com/user-attachments/assets/62cf0438-dd36-49af-acac-383fecba04ae" />


## 1. Summary & Project Purpose
Netify is a full-stack, secure Internet Service Provider (ISP) management platform designed to handle subscriber personal data, lifecycles, account provisioning, dynamic subscription tiers, billing statements, and administrative telemetry. From a cybersecurity perspective, the company's assets are customers' personal information, financial data, and login credentials.

<img width="245" height="552" alt="image" src="https://github.com/user-attachments/assets/86d84f43-52d5-4078-86cc-8a594d4aedeb" />

The primary objective of this project is to implement and demonstrate skills in every stack of web application development, defense-in-depth application security principles alongside core business functionality. Rather than treating security as an afterthought, Netify integrates cryptographic controls, strict boundary validation, and automated DevSecOps security testing directly into its architecture.

---

## 2. System Architecture & Tech Stack
Netify utilizes a decoupled, modern multi-tier architecture:
* **Frontend:** JavaScript, Asynchronous Fetch APIs, HTML5, and CSS.
* **Backend:** Python running on the Flask web framework, managing session states, route security guards, and business logic.
* **Database:** MySQL relational database storing normalized records for user identities, relational billing histories, and encrypted credentials.
* **Development & Deployment Context:** Hosted locally via Flask development servers integrated with local MySQL instances. Code was developed on Visual Studio Code, and saved in a local folder separating static and template folders.
* **Quality Assurance**: Unit-testing, integration testing & functional were regularly conducted throughout development to ensure proper & correct application functionality. Following completion, a user acceptance test (UAT) was simulated to ensure business requirements were adhered to.

---

## 3. Core Cybersecurity Mechanisms
The application incorporates multiple layers of security defenses to mitigate common web vulnerabilities:

* **Cryptographic Password Hashing:** Plaintext passwords are never persisted. User secrets are hashed using secure parameters (`scrypt` via Werkzeug) to protect against database compromise.
* **Strict Validation & Privilege Boundary Enforcement:** Input sanitization and rigorous regex validation are enforced across registration, login, and the critical profile update route to prevent privilege escalation or data tampering.
* **Multi-Factor Authentication (MFA):** Authentication flows require email verification (entering a 6-digit code) post-login before successfully logging in.
* **Honeypot Integration:** Implementation of trap parameters to detect and log automated vulnerability scanners or unauthorized users probing administrative entry points.
* **Tokenization of Financial Data:** Credit card data handling is abstracted via tokenization and retention of only the final four digits.
* **Session Lifecycle Management:** Enforces explicit session destruction upon logout, preventing post-logout navigation exploits.
* **Rate Limiter:** A maximum of 5 login attempts per hour are permitted to prevent brute-force attacks.

---

## 4. DevSecOps & Security Testing Methodology
To validate the security posture of Netify, a dual-testing approach combining Static and Dynamic Application Security Testing (SAST/DAST) was performed:

### Static Application Security Testing (SAST)
* **Tool Used:** **Python Bandit**
* **Execution:** Scanned the codebase AST (Abstract Syntax Tree) to flag common security issues, insecure configurations, or dangerous function calls in Python.
* **Outcome:** Addressed potential risks related to insecure bindings and input handling during development to ensure code-level hardening.

### Dynamic Application Security Testing (DAST)
* **Tool Used:** **OWASP ZAP**
* **Execution:** Performed automated and manual black-box proxy testing against the running local Flask application instance.
* **Outcome:** Corrected various flagged issues, such as setting a content security policy (CSP), and a .env to isolate sensitive login credentials need for app component integration. 

---

## 5. Repository Structure
* `/app.py` - Core Flask server, security logic, API routes, and database connectors.
* `/static/` - Client-side JavaScript bundles and stylesheets.
* `/templates/` - Jinja2 HTML templates for user dashboards and admin portals.

## 6. Application Screenshots

* **Hero Page**
<img width="1917" height="861" alt="image" src="https://github.com/user-attachments/assets/afd798b8-f6db-4fa8-814b-e7f036a8deb9" />
<img width="1917" height="636" alt="image" src="https://github.com/user-attachments/assets/c461c68b-67e4-496b-aef0-6b063b6b44f6" />

* **Create Account**
<img width="1906" height="622" alt="image" src="https://github.com/user-attachments/assets/4cf35047-d5a9-43fb-b969-ab72a9f4fe3e" />
<img width="1882" height="845" alt="image" src="https://github.com/user-attachments/assets/0f43a34a-dff6-4db5-afcc-957b30fb5dd8" />

* **Login Page**
<img width="1907" height="677" alt="image" src="https://github.com/user-attachments/assets/a6b36d80-1ff2-4b3f-b5fb-a27b97252e54" />
<img width="1897" height="672" alt="image" src="https://github.com/user-attachments/assets/8dddc636-0210-4306-8112-fb358b194ca4" />

* **Customer Dashbaord**
<img width="1885" height="796" alt="image" src="https://github.com/user-attachments/assets/cc209db9-31e1-41f7-9542-99285cda6604" />
<img width="1812" height="387" alt="image" src="https://github.com/user-attachments/assets/ab0fca03-af99-4564-91df-c0b69938aadb" />








