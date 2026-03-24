
// // middleware
// export const validPassword = (req,res,next) => {
//     const { password, confirmPassword } = req.body;
//     const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/; // regular expression
    
//         if (!password) {

//             return res.status(400).send("Password is required.");
//         }

//         if (password !== confirmPassword) {
//             return res.status(400).send("Passwords do not match.");
//         }
    
    
//         if (!passwordRegex.test(password)) {
//             return res.status(400).send(
//                 "Password invalid: Must be at least 8 characters long and contain both letters and numbers."
//             );
//         }
    
//     next();
//     }


export const validPassword = (req, res, next) => {
    console.log("Body received:", req.body); 
    // 1. Destructure and trim whitespace for cleaner data
    const { password, confirmPassword } = req.body;
    
    // 2. Updated Regex (8+ chars, at least 1 letter and 1 number)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;

    // 3. Sequential Validation Checks
    if (!password || !confirmPassword) {
        return res.status(400).send("Both password fields are required.");
    }

    if (password !== confirmPassword) {
        return res.status(400).send("Passwords do not match.");
    }

    if (!passwordRegex.test(password)) {
        return res.status(400).send(
            "Password must be at least 8 characters long and contain both letters and numbers."
        );
    }

    // Pass successfully validated data to the next middleware or route
    next();
};
