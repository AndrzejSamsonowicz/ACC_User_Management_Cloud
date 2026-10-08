// Stand-in for the Firebase compat SDK (app, auth, app-check) used by the
// local mockup. Always reports one signed-in user; nothing leaves the browser.
(function () {
    const user = {
        uid: 'mock-uid',
        email: 'anna.keller@sevenseas-build.example',
        emailVerified: true,
        getIdToken: async () => 'mock-firebase-id-token',
    };
    let signedIn = !/[?&]signedOut=1/.test(location.search);
    const auth = {
        get currentUser() { return signedIn ? user : null; },
        onAuthStateChanged(cb) { setTimeout(() => cb(signedIn ? user : null), 50); return () => {}; },
        async signOut() { signedIn = false; },
        async signInWithEmailAndPassword() { signedIn = true; return { user }; },
        async createUserWithEmailAndPassword() { signedIn = true; return { user }; },
        async sendPasswordResetEmail() {},
        async setPersistence() {},
    };
    window.firebase = {
        initializeApp() { return {}; },
        apps: [],
        auth: Object.assign(() => auth, { Auth: { Persistence: { LOCAL: 'local', SESSION: 'session' } } }),
        appCheck: () => ({ activate() {}, getToken: async () => ({ token: 'mock-app-check' }) }),
    };
})();
