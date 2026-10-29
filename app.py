import os, json, datetime
from flask import Flask, render_template, request, jsonify
from google import genai
from google.genai import types

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "manavevents")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
app = Flask(__name__)

SCHEMA = """{
  "summary": "2-3 sentence overview of the plan",
  "budget": {"currency": "ISO code", "total": 0,
    "categories": [{"category": "Venue", "amount": 0, "percent": 0, "notes": "how to save"}]},
  "timeline": [{"when": "6 months before", "date": "YYYY-MM-DD", "tasks": ["task"]}],
  "vendors": [{"vendor": "Caterer", "priority": "High|Medium|Low", "book_by": "YYYY-MM-DD",
    "checklist": ["item"], "questions_to_ask": ["question"]}],
  "ideas": {"themes": [{"name": "theme", "description": "why it fits"}],
    "decor": ["idea"], "activities": ["idea"], "food": ["idea"]},
  "tips": ["practical tip"]
}"""

def build_prompt(d):
    return (
        "You are Manav Events, an expert celebration and event planner.\n"
        f"Today's date: {datetime.date.today().isoformat()}\n"
        f"Event type: {d.get('event_type')}\n"
        f"Event name/description: {d.get('event_name') or 'N/A'}\n"
        f"Event date: {d.get('event_date')}\n"
        f"Number of guests: {d.get('guests')}\n"
        f"Total budget: {d.get('budget')} {d.get('currency', 'INR')}\n"
        f"Location: {d.get('location') or 'N/A'}\n"
        f"Preferences / culture / style: {d.get('preferences') or 'None given'}\n\n"
        "Create a realistic, personalized plan:\n"
        "- Budget: split the total into 8-12 categories; amounts must add up to the total; percent is a number.\n"
        "- Timeline: step-by-step milestones from today to the event day (plus one post-event step), with real dates.\n"
        "- Vendors: caterer, decorator, photographer/videographer, venue, entertainment/DJ, invitations, "
        "and any others that fit this event type and culture.\n"
        "- Ideas: 3 themes plus decor, activities and food ideas that fit the event, guests and location.\n"
        "Respond ONLY with JSON in exactly this shape:\n" + SCHEMA
    )

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/healthz")
def health():
    return "ok"

@app.route("/api/plan", methods=["POST"])
def plan():
    d = request.get_json(force=True, silent=True) or {}
    missing = [k for k in ("event_type", "event_date", "guests", "budget") if not d.get(k)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    try:
        resp = client.models.generate_content(
            model=MODEL,
            contents=build_prompt(d),
            config=types.GenerateContentConfig(
                response_mime_type="application/json", temperature=0.7),
        )
        return jsonify(json.loads(resp.text))
    except Exception as e:
        app.logger.exception("Plan generation failed")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), debug=True)
