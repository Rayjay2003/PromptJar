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
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('promptjar.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://prompt-jar.vercel.app",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
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
    "Tech", "Healthcare", "Finance", "Retail", "Education", "Agriculture", "Manufacturing",
    "Energy", "Entertainment", "Travel", "Fashion", "Sports", "Real Estate", "Food & Beverage",
    "Automotive", "Gaming", "Legal", "Marketing", "Cybersecurity", "Sustainability",
    "Aerospace", "Life Sciences", "Media", "Logistics", "Construction", "Hospitality",
    "Government", "Non-Profit", "Arts", "Fitness", "E-commerce", "Beauty", "Emerging Tech"
]

# Initialize OpenAI client once at startup
api_key = os.getenv("OPENROUTER_API_KEY")
if not api_key:
    logger.error("OPENROUTER_API_KEY environment variable not set")
    raise ValueError("OPENROUTER_API_KEY environment variable not set")

try:
    # Initialize OpenAI client with minimal configuration
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key
    )
    logger.info("OpenAI client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize OpenAI client: {e}")
    # Try alternative initialization
    try:
        import httpx
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            http_client=httpx.Client(timeout=60.0)
        )
        logger.info("OpenAI client initialized with custom http_client")
    except Exception as e2:
        logger.error(f"Failed to initialize OpenAI client with custom http_client: {e2}")
        client = None

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
    "niche": "Tech",
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
        # Check if OpenAI client is available
        client_status = "available" if client else "unavailable"
        api_key_status = "set" if api_key else "not set"
        
        return {
            "status": "healthy",
            "client_status": client_status,
            "api_key_status": api_key_status,
            "timestamp": asyncio.get_event_loop().time()
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
    
    if data.niche not in NICHES:
        raise HTTPException(status_code=400, detail=f"Invalid niche. Must be one of: {', '.join(NICHES)}")
    
    if not client:
        raise HTTPException(status_code=503, detail="OpenAI client not available")
    
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
            # Use ThreadPoolExecutor for the synchronous OpenAI call
            with ThreadPoolExecutor() as executor:
                response = await asyncio.get_event_loop().run_in_executor(
                    executor,
                    lambda: client.chat.completions.create(
                        model="deepseek/deepseek-r1:free",
                        messages=[{"role": "user", "content": prompt}],
                        stream=True,
                        max_tokens=2000,
                        temperature=0.7
                    )
                )
                
                logger.info("API call initiated successfully")
                full_content = ""
                
                # Collect all chunks
                chunks = await asyncio.get_event_loop().run_in_executor(
                    executor, lambda: list(response)
                )
                
                logger.info(f"Received {len(chunks)} chunks from API")
                
                for chunk in chunks:
                    if hasattr(chunk, 'choices') and chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_content += content
                
                full_content = full_content.strip()
                logger.info(f"Full content length: {len(full_content)}")
                
                # Clean and validate JSON
                if full_content:
                    try:
                        # Try to parse the full content directly
                        parsed_json = json.loads(full_content)
                        cleaned_content = json.dumps(parsed_json, ensure_ascii=False)
                        logger.info("Successfully parsed JSON response")
                        yield f"data: {cleaned_content}\n\n"
                        
                    except json.JSONDecodeError as e:
                        logger.warning(f"Initial JSON parsing failed: {str(e)}")
                        
                        # Try to extract JSON from the content
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
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )

# Error handlers
@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return {"error": "Internal server error", "detail": str(exc)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)