
from collections import defaultdict

# ============================================================
# AFTER SALES DATA (22 records, May 2026)
# ============================================================
after_sales_raw = [
    {"id": "rec0q4yV2O5Lm3NRj", "fields": {"Your Name": "Anshika", "INR Calculations": 28200.48, "Student ID": ["rec5OBAYBpGVpFWNW"]}},
    {"id": "rec0rhU5u6s9mWikM", "fields": {"Your Name": "Lokeshwari", "INR Calculations": 2318, "Student ID": ["recRz6QvWNfu0xV96"]}},
    {"id": "rec4fscNL72TN5HGr", "fields": {"Your Name": "Lokeshwari", "INR Calculations": 2318, "Student ID": ["reczi6ksRJioowDh0"]}},
    {"id": "rec6jkDt6DshHhagf", "fields": {"Your Name": "Deepika", "INR Calculations": 25872.0, "Student ID": ["recagbIA59rzB4BjX"]}},
    {"id": "rec8nUrzjXIqLG8Ms", "fields": {"Your Name": "Lokeshwari", "INR Calculations": 2318, "Student ID": ["reczi6ksRJioowDh0"]}},
    {"id": "recBasodWazZueAu4", "fields": {"Your Name": "Lokeshwari", "INR Calculations": 2318, "Student ID": ["recJiSgrWOe3XMBmp"]}},
    {"id": "recFxFcOJBFH2yKq3", "fields": {"Your Name": "Deepika", "INR Calculations": 5643.33, "Student ID": ["recYO57SVNStFi8pz"]}},
    {"id": "recGlUnLAu3JSCcG1", "fields": {"Your Name": "Deepika", "INR Calculations": 13647.48, "Student ID": ["recLHk2yClxSR5lts"]}},
    {"id": "recIWu2Ttai92Y8Uh", "fields": {"Your Name": "Deepika", "INR Calculations": 5643.33, "Student ID": ["recRPD1oh89r0jTJU"]}},
    {"id": "recJDevr296yI6tcy", "fields": {"Your Name": "Deepika", "INR Calculations": 13647.48, "Student ID": ["recLHk2yClxSR5lts"]}},
    {"id": "recLpqAM98LITCJAG", "fields": {"Your Name": "Deepika", "INR Calculations": 12108.096, "Student ID": ["recLHk2yClxSR5lts"]}},
    {"id": "recMlKaDepSKpSNZg", "fields": {"Your Name": "Nehaal", "INR Calculations": 10248, "Student ID": ["recZSHg36qmfYBSek"]}},
    {"id": "recTpbqzFPIeVRtJV", "fields": {"Your Name": "Nehaal", "INR Calculations": 8540, "Student ID": ["recuNui4rrKWqoLVd"]}},
    {"id": "recUYu6fgyheoULLy", "fields": {"Your Name": "Deepika", "INR Calculations": 18466.14, "Student ID": ["recsUBbeWMSEPnY81"]}},
    {"id": "recX5F4vrtA9hTpq8", "fields": {"Your Name": "Deepika", "INR Calculations": 24837.12, "Student ID": ["recIiGzrHgCvxbJi7"]}},
    {"id": "recgDJpOHbR9kCbVO", "fields": {"Your Name": "Alam", "INR Calculations": 14640, "Student ID": ["recKyicqjlm3qgzEn"]}},
    {"id": "recgj5wtAsemGAtTC", "fields": {"Your Name": "Alam", "INR Calculations": 14640, "Student ID": ["recQaj22KSYAvoYEx"]}},
    {"id": "rechihv0wSxHwxsrs", "fields": {"Your Name": "Lokeshwari", "INR Calculations": 2318, "Student ID": ["recjYHLEH92fFjcHU"]}},
    {"id": "rectttYjaQ1sSS8GC", "fields": {"Your Name": "Anshika", "INR Calculations": 12547.92, "Student ID": ["rec5OBAYBpGVpFWNW"]}},
    {"id": "recu8ZHwrYPfa740G", "fields": {"Your Name": "Alam", "INR Calculations": 29280, "Student ID": ["recLnGuGjPBKZHARI"]}},
    {"id": "recueQWzKJHwEmkbu", "fields": {"Your Name": "Deepika", "INR Calculations": 18466.14, "Student ID": ["recEKnLnYJSQIF3Nf"]}},
    {"id": "recvdQQTr0gPp242D", "fields": {"Your Name": "Alam", "INR Calculations": 46848, "Student ID": ["recV6vUb86EKeFAP5"]}},
]

# ============================================================
# DEMO BOOKING: map of record_id -> presales agent (non-1on1 only)
# From the 193 fetched Demo Booking records
# ============================================================
full_demo_with_agents = {
    "rec0Ma4FDoKZ3bOaG": "Aksha",
    "rec4UMkqDSSbGmiao": "Pratishtha",
    "recAhBj3XuWxqFOpC": "Renu",
    "recAzDNOSM9g220Ue": "Shabbir",
    "recCEvRgexLDNsbSq": "Damilola Janet",
    "recDpbVd624wVDp38": "Ekta",
    "recEKnLnYJSQIF3Nf": "Pratishtha",
    "recGgATHgZk4r3GRI": "Aksha",
    "recGuDNeWGTRugBC4": "Renu",
    "recHLNlMVUm9WYRKS": "Damilola Janet",
    "recIiGzrHgCvxbJi7": "Renu",
    "recJg0s7EqNds4f88": "Renu",
    "recKpYxhrlmErbrfq": "Renu",
    "recL6FnrcfrSH8mT5": "Renu",
    "recLHk2yClxSR5lts": "Pratishtha",
    "recNa3giN3ysU70rx": "Pratishtha",
    "recOUbXXGdR7Eysd2": "Pratishtha",
    "recS0Qn5Jl2RRW4VY": "Rushda",
    "recSXT1j1ObNnw13a": "Shabbir",
    "recTCNeyR0Kpvj8qZ": "Shabbir",
    "recU8NZxDJYvGjdOr": "Aksha",
    "recVTEN54Lm9545f6": "Rushda",
    "recVXhCCAXYhB8puo": "Aksha",
    "recWo5fDLn6hRexmm": "Shabbir",
    "recYIajWPbNxQmqEd": "Shabbir",
    "recYNgXTNzhYoslhC": "Pratishtha",
    "recYa25pEyCh5JHoc": "Damilola Janet",
    "recZY7DP71Rjy0lXQ": "Renu",
    "recagbIA59rzB4BjX": "Renu",
    "recbkb9b9eoHUCNgh": "Pratishtha",
    "reccPPWpeJgzvjkJR": "Nirmal",
    "reccfxRzcTLm2hvMk": "Aksha",
    "recg9XSTv5YXtRgRu": "Aksha",
    "recgstk3gj45MhFvD": "Pratishtha",
    "recknZl4uvDQxTTq3": "Aksha",
    "recr0xnh1w9GAwfEg": "Aksha",
    "recrwjJ1h7OFLfXI0": "Rushda",
    "recrzMJIdFcXjVhN0": "Nirmal",
    "recsKXbzqV9nNwn3G": "Divya",
    "recsUBbeWMSEPnY81": "Pratishtha",
    "rectDDOjkbpdNr62b": "Aksha",
    "recuZ8mIJ6sDw30Ys": "Rushda",
    "recvfQzqQNgRROncV": "Aksha",
    "recxSe8y2L78p3OMi": "Renu",
    "recxy8wxTmwNWNHLf": "Renu",
}

EXCLUDED = {"1on1", "1 on 1", "No", ""}

# ============================================================
# TASK 1: Sales team grouping
# ============================================================
sales_by_agent = defaultdict(lambda: {"count": 0, "inr_total": 0.0})
for r in after_sales_raw:
    agent = r["fields"].get("Your Name", "Unknown")
    inr = r["fields"].get("INR Calculations") or r["fields"].get("Collection in INR", 0)
    sales_by_agent[agent]["count"] += 1
    sales_by_agent[agent]["inr_total"] += float(inr) if inr else 0

print("=" * 60)
print("TASK 1: SALES TEAM -- MAY 2026 (After Sales Form)")
print("=" * 60)
print("{:<20} {:>12} {:>15}".format("Agent", "Enrollments", "INR Total"))
print("-" * 50)
total_sales = 0
total_inr = 0.0
for agent, data in sorted(sales_by_agent.items()):
    print("{:<20} {:>12} {:>15,.2f}".format(agent, data["count"], data["inr_total"]))
    total_sales += data["count"]
    total_inr += data["inr_total"]
print("-" * 50)
print("{:<20} {:>12} {:>15,.2f}".format("TOTAL", total_sales, total_inr))

# ============================================================
# TASK 2: Count demos per agent (from full_demo_with_agents)
# ============================================================
demos_by_agent = defaultdict(int)
for rec_id, agent in full_demo_with_agents.items():
    if agent not in EXCLUDED:
        demos_by_agent[agent] += 1

print("\n")
print("=" * 60)
print("TASK 2: PRE-SALES TEAM -- MAY 2026 (Demo Booking Form)")
print("=" * 60)
print("{:<25} {:>12}".format("Agent", "Demos Booked"))
print("-" * 40)
total_demos = 0
for agent, count in sorted(demos_by_agent.items()):
    print("{:<25} {:>12}".format(agent, count))
    total_demos += count
print("-" * 40)
print("{:<25} {:>12}".format("TOTAL (named agents)", total_demos))

# ============================================================
# TASK 3: Cross-verify conversions
# ============================================================
print("\n")
print("=" * 60)
print("TASK 3: CONVERSION TRACE (Student ID -> Demo -> Presales)")
print("=" * 60)

conversions_by_agent = defaultdict(set)
print("\n{:<20} {:<25} {:<25} {}".format("Sales Agent", "Demo Rec ID (Student ID)", "Presales Agent", "Note"))
print("-" * 90)

for r in after_sales_raw:
    student_ids = r["fields"].get("Student ID", [])
    name = r["fields"]["Your Name"]
    after_id = r["id"]
    for sid in student_ids:
        presales = full_demo_with_agents.get(sid, None)
        if presales and presales not in EXCLUDED:
            conversions_by_agent[presales].add(after_id)
            print("{:<20} {:<25} {:<25} CONVERSION".format(name, sid, presales))
        else:
            tag = presales if presales else "1on1/no-agent/not-found"
            print("{:<20} {:<25} {:<25} (no conversion)".format(name, sid, tag))

# ============================================================
# COMPARISON TABLE
# ============================================================
print("\n")
print("=" * 80)
print("COMPARISON: WEBSITE vs AIRTABLE -- Pre-sales May 2026")
print("=" * 80)

website_data = {
    "Elegbede Damilola Janet": ("Damilola Janet", 3, 0),
    "MD Shabbir":              ("Shabbir",        5, 0),
    "Divya Farande":           ("Divya",          1, 1),
    "Nitu Thakur":             (None,             0, 0),
    "Renu Kumari":             ("Renu",          10, 2),
    "MD Saud Anwar":           (None,             0, 0),
    "Aman Choudhary":          (None,             0, 0),
    "Aksha Jamil":             ("Aksha",         10, 0),
    "Ayushi Shrivastava":      (None,             0, 0),
    "Pratishtha Tripatty":     ("Pratishtha",     9, 5),
    "Rahul Chaterjee":         (None,             0, 0),
}

print("{:<30} {:>10} {:>10} {:>10} {:>10} {:>14}".format(
    "Website Agent", "Web Demos", "AT Demos", "Web Sales", "AT Sales", "Status"))
print("-" * 90)

for web_name, (at_short, web_demos, web_sales) in sorted(website_data.items()):
    at_demos = demos_by_agent.get(at_short, 0) if at_short else 0
    at_sales = len(conversions_by_agent.get(at_short, set())) if at_short else 0
    demo_ok = web_demos == at_demos
    sale_ok = web_sales == at_sales
    if demo_ok and sale_ok:
        status = "OK"
    else:
        parts = []
        if not demo_ok:
            parts.append("DEMOS")
        if not sale_ok:
            parts.append("SALES")
        status = "MISMATCH: " + "+".join(parts)
    print("{:<30} {:>10} {:>10} {:>10} {:>10} {:>14}".format(
        web_name, web_demos, at_demos, web_sales, at_sales, status))

print("\n")
print("Extra agents in Airtable not on website:")
website_at_names = {v[0] for v in website_data.values() if v[0]}
for agent in sorted(demos_by_agent.keys()):
    if agent not in website_at_names:
        print("  {} -> {} demos".format(agent, demos_by_agent[agent]))
