from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import logging
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json

app = FastAPI()
logging.basicConfig(filename='promptjar_errors.log', level=logging.ERROR, format='%(asctime)s - %(levelname)s - %(message)s')

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "https://your-deployed-frontend.com"],  # Update with frontend URL
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

# Comprehensive list of niches
NICHES = [
    "Tech", "Healthcare", "Finance", "Retail", "Education", "Agriculture", "Manufacturing",
    "Energy", "Entertainment", "Travel", "Fashion", "Sports", "Real Estate", "Food & Beverage",
    "Automotive", "Gaming", "Legal", "Marketing", "Cybersecurity", "Sustainability",
    "Aerospace", "Life Sciences", "Media", "Logistics", "Construction", "Hospitality",
    "Government", "Non-Profit", "Arts", "Fitness", "E-commerce", "Beauty", "Emerging Tech"
]

@app.post("/generate")
async def generate(data: InputData):
    if not data.topic.strip() or len(data.topic) > 100:
        return StreamingResponse(lambda: iter([""]), media_type="text/plain")
    if data.niche not in NICHES:
        return StreamingResponse(lambda: iter([""]), media_type="text/plain")

    prompt = (
        f"Generate content for topic: {data.topic}, niche: {data.niche}. "
        f"Return ONLY a single, complete, valid JSON object with NO additional text, markdown, or formatting "
        f"(e.g., no ```json, no extra spaces, no explanations). Include:\n"
        f"- {data.num_hooks} hooks (attention-grabbing opening lines)\n"
        f"- {data.num_headlines} headlines (engaging titles)\n"
        f"- An outline with an intro (1-2 sentences) and {data.num_sections} sections (brief titles)\n"
        f"- {data.num_tweets} tweets (short, engaging posts under 280 characters)\n"
        f"The output must be a complete JSON object starting with '{{' and ending with '}}' with no preceding or following characters. "
        f"Do not add any text before or after the JSON."
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
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as pool:
            try:
                response = client.chat.completions.create(
                    model="deepseek/deepseek-r1:free",
                    messages=[
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    stream=True,
                    max_tokens=2000,  # Increased to ensure full response
                )
                logging.info("API call initiated")
                full_content = ""
                # Run synchronous iteration in a thread
                chunks = await loop.run_in_executor(pool, lambda: list(response))
                logging.info(f"Received {len(chunks)} chunks")
                for chunk in chunks:
                    if chunk.choices[0].delta.content is not None:
                        content = chunk.choices[0].delta.content
                        full_content += content
                        logging.debug(f"Chunk content: {content}")
                # Clean the output aggressively
                full_content = full_content.strip()
                if full_content.startswith("```json"):
                    full_content = full_content[len("```json"):].lstrip()
                if full_content.endswith("```"):
                    full_content = full_content[:-len("```")].rstrip()
                # Extract and validate the first complete JSON object
                start_idx = full_content.find("{")
                end_idx = full_content.rfind("}") + 1
                if start_idx != -1 and end_idx > start_idx:
                    potential_json = full_content[start_idx:end_idx]
                    try:
                        # Parse and re-serialize to ensure a complete object
                        parsed_json = json.loads(potential_json)
                        cleaned_content = json.dumps(parsed_json)
                        logging.info(f"Cleaned content: {cleaned_content}")
                        yield f"data: {cleaned_content}\n\n"
                    except json.JSONDecodeError as e:
                        logging.warning(f"Invalid JSON generated: {str(e)}. Content snippet: {potential_json[:100]}...")
                        yield f"data: {{\"error\": \"Invalid JSON generated: {str(e)}\"}}\n\n"
                else:
                    logging.warning(f"No valid JSON object found in: {full_content[:100]}...")
                    yield f"data: {{\"error\": \"No valid JSON object found\"}}\n\n"
            except Exception as e:
                logging.error(f"Error in generate_stream: {str(e)}")
                yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}