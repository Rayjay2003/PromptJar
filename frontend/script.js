document.getElementById('generateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = document.getElementById('topic').value;
    const niche = document.getElementById('niche').value;
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = 'Loading...';

    try {
        const response = await fetch('http://localhost:8000/generate', {
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
            console.log('Raw chunk:', chunk); // Debug log
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

        console.log('Full data:', fullData); // Debug log before parsing
        if (fullData) {
            try {
                const json = JSON.parse(fullData);
                if (json.error) {
                    resultDiv.innerHTML = `<p style="color: red;">Error: ${json.error}</p>`;
                } else {
                    resultDiv.innerHTML = `<pre>${JSON.stringify(json, null, 2)}</pre>`;
                }
            } catch (e) {
                resultDiv.innerHTML = `<p style="color: red;">Error parsing JSON: ${e.message}</p><pre>${fullData}</pre>`;
            }
        } else {
            resultDiv.innerHTML = `<p style="color: red;">No data received</p>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
});