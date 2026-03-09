// Secure authentication system
class AuthManager {
  constructor() {
    this.form = document.getElementById("loginForm");
    this.passwordInput = document.getElementById("passwordInput");
    this.errorMessage = document.getElementById("errorMessage");
    this.submitButton = this.form.querySelector('button[type="submit"]');
    this.init();
  }

  init() {
    this.form.addEventListener("submit", (e) => this.handleLogin(e));
    this.passwordInput.addEventListener("input", () => this.hideError());
    
    // Check if already authenticated
    this.checkExistingAuth();
  }

  async checkExistingAuth() {
    const token = localStorage.getItem("admin_token");
    if (token) {
      const isValid = await this.verifyToken(token);
      if (isValid) {
        window.location.href = "/admin.html";
      } else {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("token_expires");
      }
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    
    const password = this.passwordInput.value.trim();
    if (!password) {
      this.showError("Please enter a password");
      return;
    }

    this.setLoading(true);
    this.hideError();

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'login',
          password: password
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store token and expiration
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("token_expires", Date.now() + data.expiresIn);
        
        // Redirect to admin panel
        window.location.href = "/admin.html";
      } else {
        this.showError(data.message || "Authentication failed");
        this.passwordInput.value = "";
        this.passwordInput.focus();
        
        // Handle rate limiting
        if (response.status === 429) {
          this.passwordInput.disabled = true;
          this.submitButton.disabled = true;
          
          setTimeout(() => {
            this.passwordInput.disabled = false;
            this.submitButton.disabled = false;
            this.passwordInput.focus();
          }, (data.retryAfter || 60) * 1000);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showError("Network error. Please try again.");
    } finally {
      this.setLoading(false);
    }
  }

  async verifyToken(token) {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'verify',
          token: token
        })
      });

      const data = await response.json();
      return response.ok && data.success;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  }

  setLoading(loading) {
    if (loading) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = "Authenticating...";
      this.passwordInput.disabled = true;
    } else {
      this.submitButton.disabled = false;
      this.submitButton.textContent = "Login";
      this.passwordInput.disabled = false;
    }
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.style.display = "block";
  }

  hideError() {
    this.errorMessage.style.display = "none";
  }
}

// Initialize authentication when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new AuthManager();
});