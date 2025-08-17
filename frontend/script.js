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
            html += `<li>${index + 1}. <span class="text">${escapeHtml(hook)}</span></li>\n`; // Changed to .text class
        });
        html += '</ul></div><div class="section-spacer"></div>\n';
    }

    if (obj.headlines && Array.isArray(obj.headlines)) {
        html += '<div class="section"><h4>📰 HEADLINES</h4><ul class="json-list">\n';
        obj.headlines.forEach((headline, index) => {
            html += `<li>${index + 1}. <span class="text">${escapeHtml(headline)}</span></li>\n`; // Changed to .text class
        });
        html += '</ul></div><div class="section-spacer"></div>\n';
    }

    if (obj.outline) {
        html += '<div class="section"><h4>📋 OUTLINE</h4>\n';
        if (obj.outline.intro) {
            html += `<p><strong>Intro:</strong> <span class="text">${escapeHtml(obj.outline.intro)}</span></p>\n`; // Changed to .text class
        }
        if (obj.outline.sections && Array.isArray(obj.outline.sections)) {
            html += '<ul class="json-list">\n';
            obj.outline.sections.forEach((section, index) => {
                html += `<li>${index + 1}. <span class="text">${escapeHtml(section)}</span></li>\n`; // Changed to .text class
            });
            html += '</ul>\n';
        }
        html += '</div><div class="section-spacer"></div>\n';
    }

    if (obj.tweets && Array.isArray(obj.tweets)) {
        html += '<div class="section"><h4>🐦 TWEETS</h4><ul class="json-list">\n';
        obj.tweets.forEach((tweet, index) => {
            html += `<li>${index + 1}. <span class="text">${escapeHtml(tweet)}</span></li>\n`; // Changed to .text class
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
        gap: 10px;
        padding: 20px;
        font-size: 16px;
        color: #666;
    }
    
    .error {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        padding: 12px;
        margin: 10px 0;
    }
    
    .error details {
        margin-top: 10px;
    }
    
    .error summary {
        cursor: pointer;
        font-weight: bold;
    }
    
    .raw-data {
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 10px;
        max-height: 200px;
        overflow-y: auto;
        font-size: 12px;
        margin-top: 10px;
    }
    
    .section-spacer {
        height: 20px;
    }
    
    .json-list {
        margin: 10px 0;
        padding-left: 20px;
    }
    
    .json-list li {
        margin: 8px 0;
        line-height: 1.4;
    }
    
    .text { /* Replaced .value with .text */
        color: #333; /* Neutral color instead of blue */
        font-weight: normal; /* Ensure no unintended bolding */
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);