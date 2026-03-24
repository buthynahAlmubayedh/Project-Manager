
/*
async function submitAccount() {
    const passwordLegit = document.getElementById('password').value;
    
    const userData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        confirmPassword: document.getElementById('confirmPassword').value
    };

    try {
        const response = await fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const result = await response.text();
        if (response.ok) {
            alert('Success! ' + result);
        } else {
            alert('Error: ' + result);
        }
    } catch (error) {
        console.error('Network Error:', error);
    }
}
*/

async function submitAccount() {
    // 1. Get elements and values
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const submitBtn = document.getElementById('submitBtn') || document.querySelector('button');

    // 2. Client-side Match Check (2026 UX Best Practice)
    // Checking locally prevents a slow network round-trip for a simple typo
    if (password !== confirmPassword) {
        alert("Error: Passwords do not match!");
        return; 
    }

    const userData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: password,
        confirmPassword: confirmPassword
    };

    try {
        // 3. Prevent Double Submissions
        // Disable the button immediately so the user doesn't click twice
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Creating Account...";
        }

        const response = await fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        // 4. Handle Server Responses
        const result = await response.text();

        if (response.ok) {
            // response.ok is true for status codes 200-299
            alert('Success! ' + result);
            // Optionally redirect after a successful registration
            // window.location.href = '/dashboard';
        } else {
            // This captures your 400, 409, or 500 errors from the server
            alert('Server Error: ' + result);
        }

    } catch (error) {
        // This handles actual network failures (e.g., server is offline)
        console.error('Network Error:', error);
        alert('Network error: Could not reach the server. Please check your connection.');
    } finally {
        // 5. Cleanup
        // Always re-enable the button so the user can try again if there was an error
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "Create Account";
        }
    }
}




/*

document.getElementById('accountForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Stop standard form redirect

    const userData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        confirmPassword: document.getElementById('repeatPassword').value
    };

    try {
        const response = await fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const result = await response.text();

        if (response.ok) {
            // Display the success message in the browser
            alert("Success: " + result);
            // Optionally redirect to a dashboard
            // window.location.href = '/dashboard';
        } else {
            alert("Error: " + result);
        }
    } catch (error) {
        console.error('Network Error:', error);
        alert('Could not connect to the server.');
    }
});
*/



