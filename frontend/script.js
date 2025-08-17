// Global config
const API_URL = 'https://promptjar.onrender.com/generate';
const HEALTH_URL = 'https://promptjar.onrender.com/health';

let lastParsedJson = null; // Store the last successfully parsed JSON

// Test backend connection on page load
document.addEventListener('DOMContentLoaded', async () => {
    await testBackendConnection();
    addClearButton(); // Add clear button on load
});

async function testBackendConnection() {
    try {
        const response = await fetch(HEALTH_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });
        
        if (response.ok) {
            const health = await response.json();
            console.log('Backend connection successful:', health);
            showStatus('Backend connected successfully', 'success');
        } else {
            throw new Error(`Health check failed: ${response.status}`);
        }
    } catch (error) {
        console.error('Backend connection failed:', error);
        showStatus('Backend connection failed. Please check your internet connection.', 'error');
    }
}

function showStatus(message, type) {
    let statusEl = document.getElementById('connectionStatus');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'connectionStatus';
        statusEl.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(statusEl);
    }
    
    statusEl.textContent = message;
    statusEl.className = `status-${type}`;
    
    if (type === 'success') {
        statusEl.style.backgroundColor = '#d4edda';
        statusEl.style.color = '#155724';
        statusEl.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
        statusEl.style.backgroundColor = '#f8d7da';
        statusEl.style.color = '#721c24';
        statusEl.style.border = '1px solid #f5c6cb';
    }
    
    if (type === 'success') {
        setTimeout(() => {
            statusEl.style.opacity = '0';
            setTimeout(() => statusEl.remove(), 300);
        }, 3000);
    }
}

document.getElementById('generateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const topic = document.getElementById('topic').value.trim();
    const niche = document.getElementById('niche').value;
    const numHooks = parseInt(document.getElementById('numHooks')?.value) || 3;
    const numHeadlines = parseInt(document.getElementById('numHeadlines')?.value) || 3;
    const numSections = parseInt(document.getElementById('numSections')?.value) || 3;
    const numTweets = parseInt(document.getElementById('numTweets')?.value) || 3;
    
    if (!topic) {
        showStatus('Please enter a topic', 'error');
        return;
    }
    
    if (topic.length > 100) {
        showStatus('Topic must be 100 characters or less', 'error');
        return;
    }
    
    const resultDiv = document.getElementById('result');
    const outputDiv = document.getElementById('output');
    const copyBtn = document.getElementById('copyBtn');
    
    resultDiv.classList.add('loading');
    outputDiv.innerHTML = '<div class="loading-spinner">🔄 Generating content...</div>';
    copyBtn.style.display = 'none';

    try {
        const requestData = {
            topic,
            niche,
            num_hooks: numHooks,
            num_headlines: numHeadlines,
            num_sections: numSections,
            num_tweets: numTweets
        };

        console.log('Sending request:', requestData);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullData = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                console.log('Processing line:', line);
                
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    
                    if (data && data !== '[DONE]') {
                        fullData += data;
                    }
                }
            }
        }

        console.log('Full data received:', fullData);

        if (fullData) {
            try {
                const json = JSON.parse(fullData);
                lastParsedJson = json;
                
                if (json.error) {
                    outputDiv.innerHTML = `<div class="error">❌ Error: ${json.error}</div>`;
                    showStatus('Generation failed', 'error');
                } else {
                    outputDiv.innerHTML = formatReadableJson(json);
                    copyBtn.style.display = 'block';
                    showStatus('Content generated successfully!', 'success');
                }
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                console.log('Raw data that failed to parse:', fullData);
                
                const jsonMatch = fullData.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const extractedJson = JSON.parse(jsonMatch[0]);
                        lastParsedJson = extractedJson;
                        outputDiv.innerHTML = formatReadableJson(extractedJson);
                        copyBtn.style.display = 'block';
                        showStatus('Content generated successfully!', 'success');
                    } catch (secondParseError) {
                        outputDiv.innerHTML = `
                            <div class="error">
                                <p>❌ Error parsing response: ${parseError.message}</p>
                                <details>
                                    <summary>Raw data received:</summary>
                                    <pre class="raw-data">${escapeHtml(fullData)}</pre>
                                </details>
                            </div>
                        `;
                    }
                } else {
                    outputDiv.innerHTML = `
                        <div class="error">
                            <p>❌ Invalid JSON response</p>
                            <details>
                                <summary>Raw data received:</summary>
                                <pre class="raw-data">${escapeHtml(fullData)}</pre>
                            </details>
                        </div>
                    `;
                }
            }
        } else {
            outputDiv.innerHTML = '<div class="error">❌ No data received from server</div>';
            showStatus('No data received', 'error');
        }

    } catch (error) {
        console.error('Request failed:', error);
        let errorMessage = 'Unknown error occurred';
        
        if (error.message.includes('fetch')) {
            errorMessage = 'Failed to connect to server. Please check your internet connection.';
        } else if (error.message.includes('HTTP error')) {
            errorMessage = `Server error: ${error.message}`;
        } else {
            errorMessage = error.message;
        }
        
        outputDiv.innerHTML = `<div class="error">❌ ${errorMessage}</div>`;
        showStatus(errorMessage, 'error');
        
    } finally {
        resultDiv.classList.remove('loading');
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatReadableJson(obj) {
    let html = '<div class="json-output">';
    html += '<h3>✨ GENERATED CONTENT</h3>\n';

    if (obj.hooks && Array.isArray(obj.hooks)) {
        html += '<div class="section"><h4>🎣 HOOKS</h4><ul class="json-list">\n';
        obj.hooks.forEach((hook, index) => {
            html += `<li>${index + 1}. <span class="value">${escapeHtml(hook)}</span></li>\n`; // Changed to .value
        });
        html += '</ul></div><div class="section-spacer"></div>\n';
    }

    if (obj.headlines && Array.isArray(obj.headlines)) {
        html += '<div class="section"><h4>📰 HEADLINES</h4><ul class="json-list">\n';
        obj.headlines.forEach((headline, index) => {
            html += `<li>${index + 1}. <span class="value">${escapeHtml(headline)}</span></li>\n`; // Changed to .value
        });
        html += '</ul></div><div class="section-spacer"></div>\n';
    }

    if (obj.outline) {
        html += '<div class="section"><h4>📋 OUTLINE</h4>\n';
        if (obj.outline.intro) {
            html += `<p><strong>Intro:</strong> <span class="value">${escapeHtml(obj.outline.intro)}</span></p>\n`; // Changed to .value
        }
        if (obj.outline.sections && Array.isArray(obj.outline.sections)) {
            html += '<ul class="json-list">\n';
            obj.outline.sections.forEach((section, index) => {
                html += `<li>${index + 1}. <span class="value">${escapeHtml(section)}</span></li>\n`; // Changed to .value
            });
            html += '</ul>\n';
        }
        html += '</div><div class="section-spacer"></div>\n';
    }

    if (obj.tweets && Array.isArray(obj.tweets)) {
        html += '<div class="section"><h4>🐦 TWEETS</h4><ul class="json-list">\n';
        obj.tweets.forEach((tweet, index) => {
            html += `<li>${index + 1}. <span class="value">${escapeHtml(tweet)}</span></li>\n`; // Changed to .value
        });
        html += '</ul></div>\n';
    }

    html += '</div>';
    return html;
}

document.getElementById('copyBtn').addEventListener('click', async () => {
    if (!lastParsedJson) {
        showStatus('No content to copy', 'error');
        return;
    }

    const btn = document.getElementById('copyBtn');
    const originalText = btn.textContent;

    try {
        let textToCopy = 'GENERATED CONTENT\n\n';
        
        if (lastParsedJson.hooks) {
            textToCopy += 'HOOKS:\n';
            lastParsedJson.hooks.forEach((hook, index) => {
                textToCopy += `${index + 1}. ${hook}\n`;
            });
            textToCopy += '\n';
        }
        
        if (lastParsedJson.headlines) {
            textToCopy += 'HEADLINES:\n';
            lastParsedJson.headlines.forEach((headline, index) => {
                textToCopy += `${index + 1}. ${headline}\n`;
            });
            textToCopy += '\n';
        }
        
        if (lastParsedJson.outline) {
            textToCopy += 'OUTLINE:\n';
            if (lastParsedJson.outline.intro) {
                textToCopy += `Intro: ${lastParsedJson.outline.intro}\n`;
            }
            if (lastParsedJson.outline.sections) {
                lastParsedJson.outline.sections.forEach((section, index) => {
                    textToCopy += `${index + 1}. ${section}\n`;
                });
            }
            textToCopy += '\n';
        }
        
        if (lastParsedJson.tweets) {
            textToCopy += 'TWEETS:\n';
            lastParsedJson.tweets.forEach((tweet, index) => {
                textToCopy += `${index + 1}. ${tweet}\n`;
            });
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
        } else {
            await fallbackCopy(textToCopy);
        }

        btn.textContent = '✅ Copied!';
        showStatus('Content copied to clipboard', 'success');
        
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);

    } catch (error) {
        console.error('Copy failed:', error);
        btn.textContent = '❌ Copy Failed';
        showStatus('Failed to copy content', 'error');
        
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }
});

function fallbackCopy(text) {
    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.left = '-999999px';
        
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                resolve();
            } else {
                reject(new Error('execCommand failed'));
            }
        } catch (err) {
            reject(err);
        } finally {
            document.body.removeChild(textarea);
        }
    });
}

function addClearButton() {
    const resultDiv = document.getElementById('result');
    let clearBtn = document.getElementById('clearBtn');
    if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.id = 'clearBtn';
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = `
            display: block;
            margin: 10px auto 0;
            padding: 8px 16px;
            background-color: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;
        clearBtn.addEventListener('click', clearOutput);
        resultDiv.appendChild(clearBtn);
    }
}

function clearOutput() {
    const form = document.getElementById('generateForm');
    if (form) {
        form.reset(); // Reset form fields
    }
    const outputDiv = document.getElementById('output');
    if (outputDiv) {
        outputDiv.innerHTML = ''; // Clear output
    }
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.style.display = 'none'; // Hide copy button
    }
    lastParsedJson = null; // Reset stored JSON
    showStatus('Content cleared', 'success');
}

const style = document.createElement('style');
style.textContent = `
    .result.loading .output {
        opacity: 0.6;
        pointer-events: none;
    }
    
    .loading-spinner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 15px;
        padding: 30px;
        font-size: 16px;
        color: #b0b0b0;
    }
    
    .error {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
        border-radius: 6px;
        padding: 15px;
        margin: 10px 0;
        border-left: 4px solid #e74c3c;
    }
    
    .error details {
        margin-top: 12px;
    }
    
    .error summary {
        cursor: pointer;
        font-weight: bold;
        padding: 5px;
        border-radius: 4px;
        background: rgba(231, 76, 60, 0.1);
    }
    
    .error summary:hover {
        background: rgba(231, 76, 60, 0.2);
    }
    
    .raw-data {
        background: #2c2c2c;
        border: 1px solid #444444;
        border-radius: 6px;
        padding: 15px;
        max-height: 250px;
        overflow-y: auto;
        font-size: 12px;
        margin-top: 10px;
        white-space: pre-wrap;
        font-family: 'Courier New', Courier, monospace;
        line-height: 1.4;
        color: #ccc;
    }
    
    .raw-data::-webkit-scrollbar {
        width: 8px;
    }
    
    .raw-data::-webkit-scrollbar-track {
        background: #3a3a3a;
        border-radius: 4px;
    }
    
    .raw-data::-webkit-scrollbar-thumb {
        background: #00cc99;
        border-radius: 4px;
    }
    
    .section-spacer {
        height: 30px;
    }
    
    .json-output {
        background-color: #2c2c2c; /* Matches your theme */
        border: 1px solid #3a3a3a; /* Subtle border */
        border-radius: 5px;
        padding: 15px;
        margin-top: 10px;
    }
    
    .section {
        background-color: #3a3a3a; /* Matches your output background */
        border: 1px solid #444444; /* Matches your output border */
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 10px;
    }
    
    .json-list {
        list-style: none;
        padding-left: 0;
    }
    
    .json-list li {
        margin: 12px 0;
        padding: 15px;
        background: #444444;
        border-radius: 8px;
        font-size: 1.05em;
        border-left: 3px solid #00cc99;
        transition: all 0.2s ease;
    }
    
    .json-list li:hover {
        background: #4a4a4a;
        transform: translateX(2px);
    }
    
    .value {
        color: #ffffff; /* White text for dark theme */
        font-weight: normal;
    }
    
    h3, h4 {
        color: #2c3e50;
        margin-bottom: 5px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);