// Global config
const API_URL = 'https://promptjar.onrender.com/generate';  // Updated to live backend URL

let lastParsedJson = null; // Store the last successfully parsed JSON

document.getElementById('generateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = document.getElementById('topic').value;
    const niche = document.getElementById('niche').value;
    const numHooks = parseInt(document.getElementById('numHooks')?.value) || 3;  // Default to 3 if not found
    const numHeadlines = parseInt(document.getElementById('numHeadlines')?.value) || 3;
    const numSections = parseInt(document.getElementById('numSections')?.value) || 3;
    const numTweets = parseInt(document.getElementById('numTweets')?.value) || 3;
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
            body: JSON.stringify({ topic, niche, num_hooks: numHooks, num_headlines: numHeadlines, num_sections: numSections, num_tweets: numTweets }),
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
    html += '<h3>GENERATED CONTENT</h3>\n'; // Explicit newline

    if (obj.hooks) {
        html += '<div class="section"><h4>HOOKS</h4><ul class="json-list">\n';
        obj.hooks.forEach((hook, index) => {
            html += `<li>${index + 1}. <span class="value">${hook}</span></li>\n`; // Newline after each item
        });
        html += '</ul></div><div class="section-spacer"></div>\n'; // Newline after spacer
    }

    if (obj.headlines) {
        html += '<div class="section"><h4>HEADLINES</h4><ul class="json-list">\n';
        obj.headlines.forEach((headline, index) => {
            html += `<li>${index + 1}. <span class="value">${headline}</span></li>\n`;
        });
        html += '</ul></div><div class="section-spacer"></div>\n';
    }

    if (obj.outline) {
        html += '<div class="section"><h4>OUTLINE</h4>\n';
        if (obj.outline.intro) {
            html += `<p><strong>Intro:</strong> <span class="value">${obj.outline.intro}</span></p>\n`;
        }
        if (obj.outline.sections) {
            html += '<ul class="json-list">\n';
            obj.outline.sections.forEach((section, index) => {
                html += `<li>${index + 1}. <span class="value">${section}</span></li>\n`;
            });
            html += '</ul>\n';
        }
        html += '</div><div class="section-spacer"></div>\n';
    }

    if (obj.tweets) {
        html += '<div class="section"><h4>TWEETS</h4><ul class="json-list">\n';
        obj.tweets.forEach((tweet, index) => {
            html += `<li>${index + 1}. <span class="value">${tweet}</span></li>\n`;
        });
        html += '</ul></div>\n';
    }

    html += '</div>';
    return html;
}

// Copy to clipboard functionality
document.getElementById('copyBtn').addEventListener('click', () => {
    const outputDiv = document.getElementById('output');
    const textToCopy = outputDiv.textContent.trim(); // Get rendered text with line breaks

    // Copy the text as-is to match the output format
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            const btn = document.getElementById('copyBtn');
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = 'Copy to Clipboard';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Copy failed. Please try again.');
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
        console.error('Failed to copy raw text: ', err);
        alert('Copy failed. Please try again.');
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