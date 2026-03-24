// Middleware to check if user is logged in
export const checkAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        // User is logged in, proceed to the next function
        next();
    } else {
        // User is not logged in, redirect to login page
        res.redirect("/login");
    }
};
