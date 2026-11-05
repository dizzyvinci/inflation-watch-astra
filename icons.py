"""Original code-drawn preview icons, independent of blocked sprite servers."""
import hashlib
import html
from pathlib import Path

def icon(slug,category):
    palette=['#8bb6c9','#c7a9d6','#84b99c','#dbab76','#d795a2','#d4c57e']
    color=palette[int(hashlib.sha256(slug.encode()).hexdigest()[:4],16)%len(palette)]
    stroke='#293644'
    if 'scroll' in slug:
        band='#b1bec8' if 'greater' in slug else '#d3af65' if 'intermediate' in slug else '#bb7b79'
        inner=f'<path d="M10 6h17v23H10l-3-4V9Z" fill="#decda5" stroke="{stroke}" stroke-width="1.5"/><path d="M10 6h17l3 4H13Z" fill="#efdebb" stroke="{stroke}"/><path d="M12 11h14v5H12Z" fill="{band}"/><path d="M14 20h8m-8 4h8" stroke="#8e8065" stroke-width="1.5"/><circle cx="24" cy="24" r="4" fill="{color}" stroke="{stroke}"/>'
    elif 'coupon' in slug or 'skill' in slug or 'reset' in slug:
        inner=f'<path d="M5 9h24v6q-5 3 0 6v6H5v-6q5-3 0-6Z" fill="{color}" stroke="{stroke}" stroke-width="1.5"/><path d="M12 9v18" stroke="#f4ead2" stroke-dasharray="2 2"/><path d="m20 14 1.5 3.5 3.5.5-2.5 2.5.5 3.5-3-2-3 2 .5-3.5-2.5-2.5 3.5-.5Z" fill="#f4d996"/>'
    elif any(x in slug for x in ['kitty','bunny','puppy','pig']):
        ears='<path d="M9 12 8 3 15 8M20 8l7-5-2 10" fill="#bd987c" stroke="#293644"/>' if 'bunny' not in slug else '<path d="M11 14Q5-2 12 2l5 13m2-1Q20-3 25 2l-2 14" fill="#bdacb5" stroke="#293644"/>'
        inner=ears+'<ellipse cx="17" cy="24" rx="9" ry="7" fill="#b39175"/><ellipse cx="17" cy="16" rx="11" ry="9" fill="#d4b796" stroke="#293644"/><circle cx="13" cy="15" r="1.3" fill="#293644"/><circle cx="22" cy="15" r="1.3" fill="#293644"/><path d="m16 19 2 2 2-2" stroke="#765348" fill="none"/><path d="M9 28h5m7 0h4" stroke="#765348" stroke-width="2"/>'
    elif category=='Consumables' or any(x in slug for x in ['water','potion','life']):
        inner=f'<path d="M13 4h9v10q10 9 5 16H8q-5-7 5-16Z" fill="#c9dfdd" fill-opacity=".8" stroke="{stroke}" stroke-width="1.5"/><path d="M9 21h17l1 7H9Z" fill="{color}"/><rect x="12" y="3" width="11" height="5" rx="1" fill="#a28660" stroke="{stroke}"/><path d="M12 22v4" stroke="#f2ead9" stroke-width="2"/>'
    elif 'star' in slug or 'wolbi' in slug:
        inner='<path d="m17 2 4 10 10 5-10 4-4 11-4-11-11-4 11-5Z" fill="#8ba4b9" stroke="#293644" stroke-width="1.5"/><path d="m17 4 1 12 12 1-12 1-1 12-1-12-12-1 12-1Z" fill="#dce4dc"/><circle cx="17" cy="17" r="3" fill="#394958"/>'
    elif 'earring' in slug:
        inner=f'<path d="M9 7v9m16-9v9" stroke="#dfc77c" stroke-width="3"/><circle cx="9" cy="6" r="3" fill="#dfc77c"/><circle cx="25" cy="6" r="3" fill="#dfc77c"/><path d="m9 14 6 8-6 9-6-9Zm16 0 6 8-6 9-6-9Z" fill="{color}" stroke="{stroke}"/><path d="m9 17-3 5 3 5m16-10-3 5 3 5" stroke="#e9e7d6" fill="none"/>'
    elif category=='Materials':
        inner=f'<path d="m4 23 6-15 12-4 9 12-5 14H11Z" fill="{color}" stroke="{stroke}" stroke-width="1.5"/><path d="m10 8 6 9 6-13m-6 13 15-1m-15 1-5 13m5-13 10 13" fill="none" stroke="#e0e6de" stroke-opacity=".6"/><path d="m10 8 6 9-12 6" fill="#f0ead8" fill-opacity=".2"/>'
    elif 'hat' in slug or 'ribbon' in slug:
        inner=f'<path d="M7 21Q7 5 17 5t10 16" fill="{color}" stroke="{stroke}" stroke-width="1.5"/><ellipse cx="17" cy="23" rx="15" ry="5" fill="{color}" stroke="{stroke}"/><path d="M8 18h18" stroke="#dfc77c" stroke-width="4"/>'
    elif category=='Weapons':
        inner=f'<path d="m7 28 5-5 3 3-5 5Z" fill="#c7ad6e" stroke="{stroke}"/><path d="m11 20 4 5L30 6l-8 4Z" fill="#c0cfcd" stroke="{stroke}"/><path d="m10 18 8 8" stroke="#c7ad6e" stroke-width="4"/>'
    else:
        inner=f'<path d="m9 5 8 4 8-4 7 9-7 5v12H9V19l-7-5Z" fill="{color}" stroke="{stroke}" stroke-width="1.5"/><path d="m13 8 4 6 4-6M17 15v15" stroke="#e7e2cd" stroke-width="1.5"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><title>{html.escape(slug.replace("-"," "))}</title>{inner}</svg>'

def write_icons(report,directory):
    directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
    for row in report['rows']+report['cash']:
        (directory/(row['slug']+'.svg')).write_text(icon(row['slug'],row.get('category','Cash Shop')),encoding='utf-8')
    (directory/'leaf.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#25302f"/><path d="m16 4 3 8 7-2-3 7 5 4-10 3-2 5-1-6-10-3 5-5-2-7 6 4Z" fill="#edc471"/></svg>',encoding='utf-8')
