from fastapi import FastAPI
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel
import os
import logging
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
from dotenv import load_dotenv

app = FastAPI()
logging.basicConfig(filename='promptjar_errors.log', level=logging.ERROR, format='%(asctime)s - %(levelname)s - %(message)s')
load_dotenv()  # Load .env file

# Enable CORS for frontend (update deployed URL later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://prompt-jar.vercel.app"],  # Use "*" for testing, replace with deployed URL (e.g., "https://promptjar.pxxl.click")
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InputData(BaseModel):
    topic: str
    niche: str
    num_hooks: int = 3
    num_headlines: int = 3
    num_sections: int = 3
    num_tweets: int = 3

NICHES = [
    "Tech", "Healthcare", "Finance", "Retail", "Education", "Agriculture", "Manufacturing",
    "Energy", "Entertainment", "Travel", "Fashion", "Sports", "Real Estate", "Food & Beverage",
    "Automotive", "Gaming", "Legal", "Marketing", "Cybersecurity", "Sustainability",
    "Aerospace", "Life Sciences", "Media", "Logistics", "Construction", "Hospitality",
    "Government", "Non-Profit", "Arts", "Fitness", "E-commerce", "Beauty", "Emerging Tech"
]

@app.get("/", response_class=HTMLResponse)
async def read_root():
    return "<h1>API is running. Use /generate for content generation.</h1>"

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return {"message": "No favicon available"}

@app.post("/generate")
async def generate(data: InputData):
    if not data.topic.strip() or len(data.topic) > 100:
        return StreamingResponse(lambda: iter([""]), media_type="text/plain")
    if data.niche not in NICHES:
        return StreamingResponse(lambda: iter([""]), media_type="text/plain")

    prompt = (
        f"Generate content for topic: {data.topic}, niche: {data.niche}. "
        f"Return ONLY a single, complete, valid JSON object with NO additional text, markdown, or formatting "
        f"(e.g., no ```json```). Include:\n"
        f"- {data.num_hooks} hooks (attention-grabbing opening lines)\n"
        f"- {data.num_headlines} headlines (engaging titles)\n"
        f"- An outline with an intro (1-2 sentences) and {data.num_sections} sections (brief titles)\n"
        f"- {data.num_tweets} tweets (short, engaging posts under 280 characters)\n"
        f"The output must be a complete JSON object starting with '{{' and ending with '}}' with no preceding or following characters. "
        "Ensure the entire response is a single JSON object and avoid multiple objects or trailing data."
    )
    logging.info(f"Sending prompt: {prompt}")

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        logging.error("OPENROUTER_API_KEY environment variable not set")
        raise ValueError("OPENROUTER_API_KEY environment variable not set")
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    async def generate_stream():
        with ThreadPoolExecutor() as pool:
            try:
                response = client.chat.completions.create(
                    model="deepseek/deepseek-r1:free",
                    messages=[{"role": "user", "content": prompt}],
                    stream=True,
                    max_tokens=2000,
                )
                logging.info("API call initiated")
                full_content = ""
                chunks = await asyncio.get_running_loop().run_in_executor(pool, lambda: list(response))
                logging.info(f"Received {len(chunks)} chunks")
                for chunk in chunks:
                    if chunk.choices[0].delta.content is not None:
                        content = chunk.choices[0].delta.content
                        full_content += content
                        logging.debug(f"Chunk content: {content[:100]}...")  # Limit log size
                full_content = full_content.strip()
                # Attempt to parse the full content directly
                try:
                    parsed_json = json.loads(full_content)
                    cleaned_content = json.dumps(parsed_json)
                    logging.info(f"Cleaned content: {cleaned_content}")
                    yield f"data: {cleaned_content}\n\n"
                except json.JSONDecodeError as e:
                    logging.warning(f"Invalid JSON generated: {str(e)}. Full content snippet: {full_content[:200]}...")
                    # Fallback: Try to extract the first valid JSON object
                    start_idx = full_content.find("{")
                    end_idx = full_content.rfind("}") + 1
                    if start_idx != -1 and end_idx > start_idx:
                        potential_json = full_content[start_idx:end_idx]
                        try:
                            parsed_json = json.loads(potential_json)
                            cleaned_content = json.dumps(parsed_json)
                            logging.info(f"Extracted valid JSON: {cleaned_content}")
                            yield f"data: {cleaned_content}\n\n"
                        except json.JSONDecodeError as e2:
                            logging.error(f"Failed to extract valid JSON: {str(e2)}. Content: {potential_json[:200]}...")
                            yield f"data: {{\"error\": \"Failed to parse JSON: {str(e2)}\"}}\n\n"
                    else:
                        logging.error(f"No valid JSON object found in: {full_content[:200]}...")
                        yield f"data: {{\"error\": \"No valid JSON object found\"}}\n\n"
            except Exception as e:
                logging.error(f"Error in generate_stream: {str(e)}")
                yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")

@app.get("/health")
async def health_check():
    logging.info("Health check requested")
    try:
        return {"status": "healthy"}
    except Exception as e:
        logging.error(f"Health check failed: {str(e)}")
        raise