# Hunt Prompts

[![PyPI Downloads](https://static.pepy.tech/personalized-badge/manul-engine?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/manul-engine)

Ready-to-use LLM prompts for generating ManulEngine `.hunt` test files.

## Files

| File | When to use |
|------|-------------|
| [html_to_hunt.md](html_to_hunt.md) | Paste HTML source of a page → get hunt steps |
| [description_to_hunt.md](description_to_hunt.md) | Describe a page or flow in plain text → get hunt steps |

---

## How to use with different LLMs

### GitHub Copilot Chat (VS Code) — recommended

**Option A — attach the prompt file directly:**
1. Open Copilot Chat (`Ctrl+Alt+I`).
2. Click the paperclip icon (Attach context) → select the prompt file (e.g. `prompts/html_to_hunt.md`).
3. In the chat input type your HTML or description and press Enter.
4. Copilot will return the `.hunt` content; click **Insert into new file** or copy it manually.

**Option B — use `#file` reference:**
```
Write a hunt test using the rules in #file:prompts/html_to_hunt.md for this page:
<paste HTML here>
```

**Option C — inline edit (`Ctrl+I`) on an open `.hunt` file:**
1. Create an empty `tests/mytest.hunt` file and open it.
2. Press `Ctrl+I`, type:
   ```
   Generate hunt steps using @prompts/html_to_hunt.md for: <description or paste HTML>
   ```
3. Accept the suggestion.

---

### ChatGPT / Claude (web)

1. Open the prompt file you need.
2. Select all (`Ctrl+A`), copy.
3. Paste into the chat.
4. Replace `<!-- PASTE HTML HERE -->` (or `<!-- PASTE DESCRIPTION HERE -->`) with your actual content **before sending**.
5. Send. Copy the response into a `.hunt` file in `tests/`.

---

### Claude API / OpenAI API (programmatic)

Use the prompt file content as the **system message** and your HTML/description as the **user message**:

```python
import anthropic, pathlib

system = pathlib.Path("prompts/html_to_hunt.md").read_text()
html   = pathlib.Path("mypage.html").read_text()

client = anthropic.Anthropic()
msg = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=2048,
    system=system,
    messages=[{"role": "user", "content": html}],
)
print(msg.content[0].text)
```

```python
from openai import OpenAI
import pathlib

system = pathlib.Path("prompts/description_to_hunt.md").read_text()
desc   = "Login page at https://app.example.com with Email and Password fields and a Submit button."

client = OpenAI()
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": system},
        {"role": "user",   "content": desc},
    ],
)
print(resp.choices[0].message.content)
```

---

### Ollama (local, no cloud)

```bash
# put the prompt + your HTML into one file and pipe it to ollama
cat prompts/html_to_hunt.md mypage.html | ollama run qwen2.5:7b
```

Or with the API:
```bash
jq -Rs '{model: "qwen2.5:7b", prompt: ., stream: false}' prompts/html_to_hunt.md \
  | curl http://localhost:11434/api/generate \
      -H 'Content-Type: application/json' \
      --data-binary @- \
  | jq -r .response
```

---

## After you get the output

1. Save the result as `tests/<name>.hunt`.
2. Run it:
   ```bash
   manul tests/<name>.hunt
   ```
3. Check that every `Fill` / `Type` step is followed by a strict `Verify ... has value ...` assertion when the value should remain readable.
4. If a step fails, fix the quoted label to match the exact visible text on the page.

## Hunt file quick-reference

```
@context: Short description of what this test covers
@title: tag_name
@var: {email} = admin@example.com

STEP 1: Login
    NAVIGATE to https://example.com
    Fill 'Username' field with '{email}'
    Verify 'Username' field has value '{email}'
    Fill 'Password' field with 'secret'
    Click the 'Login' button
    VERIFY that 'Welcome' is present

DONE.
```

Helper aliases use `@script:` with dotted Python imports only:

```text
@script: {auth} = helpers.auth
CALL PYTHON {auth}.issue_token into {token}
```

### Keywords
- `NAVIGATE to <url>`
- `OPEN APP`
- `WAIT <seconds>`
- `Wait for '<target>' to be visible|be hidden|disappear`
- `PRESS ENTER`
- `PRESS [Key]` (e.g. `PRESS Escape`, `PRESS Control+A`)
- `PRESS [Key] on [Element]` (e.g. `PRESS ArrowDown on 'Search Input'`)
- `RIGHT CLICK [Element]`
- `UPLOAD 'File' to 'Element'`
- `SCROLL DOWN`
- `WAIT FOR RESPONSE "<url_pattern>"`
- `EXTRACT the '<target>' into {var}`
- `VERIFY that '<target>' is present / is NOT present / is ENABLED / is DISABLED / is checked / is NOT checked`
- `Verify '<element_name>' button|field|element|input has text '<expected_text>'`
- `Verify '<element_name>' button|field|element|input has placeholder '<expected_placeholder>'`
- `Verify '<element_name>' button|field|element|input has value '<expected_value>'`
- `VERIFY SOFTLY that '<target>' is ...`
- `VERIFY VISUAL '<target>'`
- `MOCK GET|POST|PUT|PATCH|DELETE "<url_pattern>" with '<mock_file>'`
- `SCAN PAGE` / `SCAN PAGE into {filename}`
- `CALL PYTHON module.function [with args: ...] [into {result}]`
- `CALL PYTHON {alias}.function [with args: ...] [into {result}]`
- `CALL PYTHON {callable_alias} [with args: ...] [into {result}]`
- `SET {variable} = value`
- `DEBUG` / `DEBUG VARS` / `PAUSE`
- `DONE.`

### Interaction verbs
`Fill … with` · `Click` · `DOUBLE CLICK` · `RIGHT CLICK` · `Select … from` · `Check/Uncheck the checkbox for` · `HOVER over` · `Drag … and drop it into` · `UPLOAD … to`

### Contextual qualifiers
`NEAR '<anchor>'` · `ON HEADER` · `ON FOOTER` · `INSIDE '<container>' row with '<text>'`

Element type goes **outside** quotes, label goes **inside** quotes:
```
Click the 'Submit' button      ✓
Click 'Submit button'          ✗
```
