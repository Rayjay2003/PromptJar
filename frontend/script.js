// Global config
const API_URL = 'http://localhost:8000/generate';

let lastParsedJson = null; // Store the last successfully parsed JSON

document.getElementById('generateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = document.getElementById('topic').value;
    const niche = document.getElementById('niche').value;
    const resultDiv = document.getElementById('result');
    const outputDiv = document.getElementById('output');
    const copyBtn = document.getElementById('copyBtn');
    resultDiv.classList.add('loading');
    outputDiv.innerHTML = '<p>Loading...</p>';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ topic, niche }),
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullData = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            console.log('Raw chunk:', chunk);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.replace('data:', '').trim();
                    if (data && data !== '[DONE]') {
                        fullData += data;
                    }
                }
            }
        }

        console.log('Full data:', fullData);
        if (fullData) {
            try {
                const json = JSON.parse(fullData);
                lastParsedJson = json; // Store the parsed JSON
                if (json.error) {
                    outputDiv.innerHTML = `<p class="error">Error: ${json.error}</p>`;
                } else {
                    outputDiv.innerHTML = formatReadableJson(json);
                    copyBtn.style.display = 'block';
                }
            } catch (e) {
                outputDiv.innerHTML = `<p class="error">Error parsing JSON: ${e.message}</p><pre class="raw-data">${fullData.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
            }
        } else {
            outputDiv.innerHTML = '<p class="error">No data received</p>';
        }
    } catch (error) {
        outputDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    } finally {
        resultDiv.classList.remove('loading');
    }
});

// Function to format JSON with readable, spaced sections and uppercase titles
function formatReadableJson(obj) {
    let html = '<div class="json-output">';
    html += '<h3>GENERATED CONTENT</h3>';

    if (obj.hooks) {
        html += '<div class="section"><h4>HOOKS</h4><ul class="json-list">';
        obj.hooks.forEach((hook, index) => {
            html += `<li>${index + 1}. <span class="value">${hook}</span></li>`;
        });
        html += '</ul></div><div class="section-spacer"></div>';
    }

    if (obj.headlines) {
        html += '<div class="section"><h4>HEADLINES</h4><ul class="json-list">';
        obj.headlines.forEach((headline, index) => {
            html += `<li>${index + 1}. <span class="value">${headline}</span></li>`;
        });
        html += '</ul></div><div class="section-spacer"></div>';
    }

    if (obj.outline) {
        html += '<div class="section"><h4>OUTLINE</h4>';
        if (obj.outline.intro) {
            html += `<p><strong>Intro:</strong> <span class="value">${obj.outline.intro}</span></p>`;
        }
        if (obj.outline.sections) {
            html += '<ul class="json-list">';
            obj.outline.sections.forEach((section, index) => {
                html += `<li>${index + 1}. <span class="value">${section}</span></li>`;
            });
            html += '</ul>';
        }
        html += '</div><div class="section-spacer"></div>';
    }

    if (obj.tweets) {
        html += '<div class="section"><h4>TWEETS</h4><ul class="json-list">';
        obj.tweets.forEach((tweet, index) => {
            html += `<li>${index + 1}. <span class="value">${tweet}</span></li>`;
        });
        html += '</ul></div>';
    }

    html += '</div>';
    return html;
}

// Copy to clipboard with robust handling using stored JSON
document.getElementById('copyBtn').addEventListener('click', () => {
    const outputDiv = document.getElementById('output');
    let textToCopy;

    if (lastParsedJson) {
        // Use the stored JSON for copying
        textToCopy = JSON.stringify(lastParsedJson, null, 2); // Pretty-print with indentation
    } else {
        // Fallback to displayed text if no JSON is available
        textToCopy = outputDiv.textContent.trim();
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            const btn = document.getElementById('copyBtn');
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = 'Copy to Clipboard';
            }, 2000);
        }).catch(err => {
            console.error('Clipboard API failed:', err);
            fallbackCopy(textToCopy);
        });
    } else {
        fallbackCopy(textToCopy);
    }
});

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = 'Copy to Clipboard';
        }, 2000);
    } catch (err) {
        console.error('Fallback copy failed:', err);
        alert('Copy failed. Please select the text manually and copy.');
    } finally {
        document.body.removeChild(textarea);
    }
}

// Loading state styling
document.styleSheets[0].insertRule(`
    .result.loading .output {
        opacity: 0.5;
        pointer-events: none;
    }
`, document.styleSheets[0].cssRules.length);