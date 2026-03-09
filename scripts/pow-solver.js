// Proof-of-Work Solver
// Solves challenges in a Web Worker to avoid blocking the UI

class PowSolver {
    constructor() {
        this.worker = null;
        this.workerBlob = null;
    }

    // Create the worker from inline code
    createWorker() {
        const workerCode = `
            // Web Worker for PoW computation
            async function sha256(message) {
                const msgBuffer = new TextEncoder().encode(message);
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }

            async function solve(challengeData, difficulty) {
                const target = '0'.repeat(difficulty);
                let nonce = 0;
                const startTime = Date.now();
                const reportInterval = 10000; // Report progress every 10k attempts

                while (true) {
                    const nonceStr = nonce.toString(16);
                    const hash = await sha256(challengeData + nonceStr);

                    if (hash.startsWith(target)) {
                        const elapsed = Date.now() - startTime;
                        self.postMessage({
                            type: 'solved',
                            nonce: nonceStr,
                            hash: hash,
                            attempts: nonce + 1,
                            timeMs: elapsed
                        });
                        return;
                    }

                    nonce++;

                    if (nonce % reportInterval === 0) {
                        self.postMessage({
                            type: 'progress',
                            attempts: nonce,
                            timeMs: Date.now() - startTime
                        });
                    }
                }
            }

            self.onmessage = async (e) => {
                const { challengeData, difficulty } = e.data;
                await solve(challengeData, difficulty);
            };
        `;

        this.workerBlob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(this.workerBlob));
    }

    // Solve a challenge
    solve(challengeData, difficulty, onProgress) {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                this.createWorker();
            }

            const timeout = setTimeout(() => {
                this.terminate();
                reject(new Error('Challenge solving timed out'));
            }, 60000); // 60 second timeout

            this.worker.onmessage = (e) => {
                if (e.data.type === 'solved') {
                    clearTimeout(timeout);
                    resolve({
                        nonce: e.data.nonce,
                        hash: e.data.hash,
                        attempts: e.data.attempts,
                        timeMs: e.data.timeMs
                    });
                } else if (e.data.type === 'progress' && onProgress) {
                    onProgress(e.data.attempts, e.data.timeMs);
                }
            };

            this.worker.onerror = (e) => {
                clearTimeout(timeout);
                reject(new Error('Worker error: ' + e.message));
            };

            this.worker.postMessage({ challengeData, difficulty });
        });
    }

    // Terminate the worker
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.workerBlob) {
            URL.revokeObjectURL(this.workerBlob);
            this.workerBlob = null;
        }
    }
}

// Export as global
window.PowSolver = PowSolver;
