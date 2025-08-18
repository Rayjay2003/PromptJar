from fastapi import FastAPI, HTTPException
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

app = FastAPI(title="PromptJar API", version="1.0.0")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://prompt-jar.vercel.app",
    ],
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
    "entrepreneurship", "startups", "freelancing", "marketing", "personal-branding",
    "motivation-self-improvement", "side-hustles", "remote-work-digital-nomad", "tech-ai",
    "crypto-web3", "investing", "stock-market", "real-estate", "e-commerce", "saas",
    "small-business", "business-strategy", "passive-income", "dropshipping", "finance-tips",
    "budgeting-saving", "taxes", "crypto-nfts", "venture-capital", "social-media-marketing",
    "email-marketing", "seo", "copywriting", "content-marketing", "sales-funnels",
    "cold-outreach", "branding", "influencer-marketing", "affiliate-marketing",
    "marketing-psychology", "analytics-metrics", "artificial-intelligence", "machine-learning",
    "software-development", "web-development", "mobile-apps", "blockchain", "cybersecurity",
    "data-science", "cloud-computing", "ui-ux-design", "no-code-low-code", "productivity",
    "mindfulness", "mental-health", "fitness", "diet-nutrition", "minimalism", "habit-building",
    "journaling", "time-management", "stoicism", "psychology", "daily-routines", "writing",
    "art-illustration", "music", "photography", "filmmaking", "gaming", "fashion", "diy-crafts",
    "animation", "design", "relationships", "dating", "parenting", "education", "news-commentary",
    "memes-humor", "pop-culture", "politics", "language-learning", "philosophy", "indie-hackers",
    "solopreneurs", "fire", "booktok-book-twitter", "fitness-twitter", "dev-twitter",
    "money-twitter", "crypto-twitter", "ai-twitter", "writing-twitter", "design-twitter",
    "meme-creators", "healthcare", "legal", "education-edtech", "hospitality", "logistics",
    "manufacturing", "agriculture", "government-policy", "energy-sustainability", "aerospace",
    "automotive", "sports-sports-tech"
]

# Configure OpenAI for OpenRouter
api_key = os.getenv("OPENROUTER_API_KEY")
if not api_key:
    logger.error("OPENROUTER_API_KEY environment variable not set")
    raise ValueError("OPENROUTER_API_KEY environment variable not set")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    return """
    <html>
        <head><title>PromptJar API</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="color: #00cc99;">🫙 PromptJar API</h1>
            <p>API is running successfully!</p>
            <h2>Available Endpoints:</h2>
            <ul>
                <li><strong>POST /generate</strong> - Generate content (hooks, headlines, outlines, tweets)</li>
                <li><strong>GET /health</strong> - Health check</li>
                <li><strong>GET /niches</strong> - List all available niches</li>
            </ul>
            <h2>Usage:</h2>
            <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
POST /generate
{
    "topic": "AI and automation",
    "niche": "artificial-intelligence",
    "num_hooks": 3,
    "num_headlines": 3,
    "num_sections": 3,
    "num_tweets": 3
}
            </pre>
        </body>
    </html>
    """

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return {"message": "No favicon available"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        api_key_status = "set" if api_key else "not set"
        return {
            "status": "healthy",
            "api_key_status": api_key_status,
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

@app.get("/niches")
async def get_niches():
    """Get list of all available niches"""
    return {"niches": NICHES}

@app.post("/generate")
async def generate(data: InputData):
    """Generate content based on input data"""
    
    # Validate inputs
    if not data.topic.strip() or len(data.topic) > 100:
        raise HTTPException(status_code=400, detail="Topic must be between 1 and 100 characters")
    
    # Allow custom niches by checking if it's in NICHES or a valid string
    if data.niche not in NICHES and not data.niche.strip():
        raise HTTPException(status_code=400, detail="Invalid or empty niche. Please select from the list or enter a valid custom niche")
    
    # Validate number parameters
    for field, value in [
        ("num_hooks", data.num_hooks),
        ("num_headlines", data.num_headlines), 
        ("num_sections", data.num_sections),
        ("num_tweets", data.num_tweets)
    ]:
        if not 1 <= value <= 10:
            raise HTTPException(status_code=400, detail=f"{field} must be between 1 and 10")

    prompt = (
        f"Generate content for topic: '{data.topic}' in the {data.niche} niche. "
        f"Return ONLY a single, complete, valid JSON object with NO additional text, markdown, or formatting. "
        f"Include exactly:\n"
        f"- {data.num_hooks} hooks (attention-grabbing opening lines)\n"
        f"- {data.num_headlines} headlines (engaging titles)\n"
        f"- An outline with an intro (1-2 sentences) and {data.num_sections} sections (brief titles)\n"
        f"- {data.num_tweets} tweets (engaging posts under 280 characters each)\n\n"
        f"Format as JSON with keys: 'hooks', 'headlines', 'outline' (with 'intro' and 'sections' keys), 'tweets'. "
        f"Each should be an array except outline which is an object. "
        f"Ensure the response starts with '{{' and ends with '}}' with no additional characters."
    )
    
    logger.info(f"Generating content for topic: {data.topic}, niche: {data.niche}")

    async def generate_stream():
        try:
            client = OpenAI(
                api_key=os.getenv("OPENROUTER_API_KEY"),
                base_url="https://openrouter.ai/api/v1"
            )
            
            with ThreadPoolExecutor() as executor:
                response = await asyncio.get_event_loop().run_in_executor(
                    executor,
                    lambda: client.chat.completions.create(
                        model="google/gemini-2.0-flash-exp:free",
                        messages=[{"role": "user", "content": prompt}],
                        stream=True,
                        max_tokens=2000,
                        temperature=0.7
                    )
                )
            
            logger.info("API call initiated successfully")
            full_content = ""
            
            for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        content = delta.content
                        full_content += content
            
            full_content = full_content.strip()
            logger.info(f"Full content length: {len(full_content)}")
            
            if full_content:
                try:
                    parsed_json = json.loads(full_content)
                    cleaned_content = json.dumps(parsed_json, ensure_ascii=False)
                    logger.info("Successfully parsed JSON response")
                    yield f"data: {cleaned_content}\n\n"
                except json.JSONDecodeError as e:
                    logger.warning(f"Initial JSON parsing failed: {str(e)}")
                    start_idx = full_content.find("{")
                    end_idx = full_content.rfind("}") + 1
                    if start_idx != -1 and end_idx > start_idx:
                        potential_json = full_content[start_idx:end_idx]
                        try:
                            parsed_json = json.loads(potential_json)
                            cleaned_content = json.dumps(parsed_json, ensure_ascii=False)
                            logger.info("Successfully extracted and parsed JSON")
                            yield f"data: {cleaned_content}\n\n"
                        except json.JSONDecodeError as e2:
                            logger.error(f"Failed to extract valid JSON: {str(e2)}")
                            error_response = {
                                "error": "Failed to generate valid JSON response",
                                "details": str(e2)
                            }
                            yield f"data: {json.dumps(error_response)}\n\n"
                    else:
                        logger.error("No JSON structure found in response")
                        error_response = {
                            "error": "No valid JSON structure found in API response"
                        }
                        yield f"data: {json.dumps(error_response)}\n\n"
            else:
                logger.error("Empty response from API")
                error_response = {"error": "Empty response from API"}
                yield f"data: {json.dumps(error_response)}\n\n"
        except Exception as e:
            logger.error(f"Error in generate_stream: {str(e)}")
            error_response = {
                "error": f"Generation failed: {str(e)}",
                "type": type(e).__name__
            }
            yield f"data: {json.dumps(error_response)}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream"
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return {"error": "Internal server error", "detail": str(exc)}