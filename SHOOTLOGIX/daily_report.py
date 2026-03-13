"""
daily_report.py -- Generate a daily production report PDF for a given shooting day.
Aggregates PDT info, boats, vehicles, personnel, fuel, and alerts for one date.
"""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def _fmt_money(n):
    if n is None:
        return '---'
    return f'${int(round(n)):,}'


def _section_table(rows, col_widths, styles_obj):
    """Build a styled table with ShootLogix branding."""
    table = Table(rows, colWidths=col_widths)
    base_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ]
    table.setStyle(TableStyle(base_style))
    return table


def generate_daily_report(production_name, report_date, day_info, boats, picture_boats,
                          security_boats, vehicles, personnel, fuel_entries, alerts, guards):
    """Generate a multi-page daily production report PDF.

    Args:
        production_name: str
        report_date: str (YYYY-MM-DD)
        day_info: dict with day_number, location, status, events
        boats: list of dicts (name, function, rate, status)
        picture_boats: list of dicts
        security_boats: list of dicts
        vehicles: list of dicts (name, type, rate, driver)
        personnel: list of dicts (name, function, rate)
        fuel_entries: list of dicts (source, liters, fuel_type, unit_price)
        alerts: list of dicts (severity, type, msg)
        guards: list of dicts (name, post, shift)

    Returns:
        bytes -- PDF content
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            topMargin=15 * mm, bottomMargin=15 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm)

    styles = getSampleStyleSheet()
    story = []

    # ── Styles ─────────────────────────────────────────────────
    header_style = ParagraphStyle('Header', parent=styles['Title'],
                                  fontSize=16, spaceAfter=2 * mm)
    sub_style = ParagraphStyle('Sub', parent=styles['Normal'],
                                fontSize=9, textColor=colors.grey, spaceAfter=6 * mm)
    section_style = ParagraphStyle('Section', parent=styles['Heading2'],
                                   fontSize=12, spaceBefore=5 * mm, spaceAfter=3 * mm,
                                   textColor=colors.HexColor('#1E3A5F'))
    normal_style = ParagraphStyle('Normal2', parent=styles['Normal'], fontSize=9)

    # ── Header ─────────────────────────────────────────────────
    story.append(Paragraph(f"ShootLogix - {production_name}", header_style))

    day_num = day_info.get('day_number', '?')
    location = day_info.get('location', 'N/A')
    status = day_info.get('status', '')
    story.append(Paragraph(
        f"Daily Production Report - Day {day_num} - {report_date} - {location}",
        sub_style
    ))

    # ── PDT Summary ────────────────────────────────────────────
    story.append(Paragraph("Schedule (PDT)", section_style))

    events = day_info.get('events', [])
    if events:
        ev_rows = [['Type', 'Label', 'Time', 'Location']]
        for ev in events:
            ev_rows.append([
                (ev.get('event_type') or '').title(),
                ev.get('label') or '',
                ev.get('time') or '',
                ev.get('location') or '',
            ])
        story.append(_section_table(ev_rows, [30 * mm, 50 * mm, 30 * mm, 60 * mm], styles))
    else:
        story.append(Paragraph(f"Status: {status or 'No events scheduled'}", normal_style))

    story.append(Spacer(1, 3 * mm))

    # ── Boats ──────────────────────────────────────────────────
    if boats:
        story.append(Paragraph(f"Boats ({len(boats)})", section_style))
        b_rows = [['Name', 'Function', 'Group', 'Status', 'Daily Rate']]
        for b in boats:
            b_rows.append([
                b.get('name', ''),
                b.get('function', ''),
                b.get('group_name', ''),
                b.get('status', ''),
                _fmt_money(b.get('rate')),
            ])
        story.append(_section_table(b_rows, [35 * mm, 35 * mm, 30 * mm, 25 * mm, 30 * mm], styles))
        total_boats = sum(b.get('rate') or 0 for b in boats)
        story.append(Paragraph(f"Boats subtotal: {_fmt_money(total_boats)}", normal_style))

    # ── Picture Boats ──────────────────────────────────────────
    if picture_boats:
        story.append(Paragraph(f"Picture Boats ({len(picture_boats)})", section_style))
        pb_rows = [['Name', 'Function', 'Group', 'Status', 'Daily Rate']]
        for b in picture_boats:
            pb_rows.append([
                b.get('name', ''),
                b.get('function', ''),
                b.get('group_name', ''),
                b.get('status', ''),
                _fmt_money(b.get('rate')),
            ])
        story.append(_section_table(pb_rows, [35 * mm, 35 * mm, 30 * mm, 25 * mm, 30 * mm], styles))
        total_pb = sum(b.get('rate') or 0 for b in picture_boats)
        story.append(Paragraph(f"Picture boats subtotal: {_fmt_money(total_pb)}", normal_style))

    # ── Security Boats ─────────────────────────────────────────
    if security_boats:
        story.append(Paragraph(f"Security Boats ({len(security_boats)})", section_style))
        sb_rows = [['Name', 'Function', 'Group', 'Status', 'Daily Rate']]
        for b in security_boats:
            sb_rows.append([
                b.get('name', ''),
                b.get('function', ''),
                b.get('group_name', ''),
                b.get('status', ''),
                _fmt_money(b.get('rate')),
            ])
        story.append(_section_table(sb_rows, [35 * mm, 35 * mm, 30 * mm, 25 * mm, 30 * mm], styles))
        total_sb = sum(b.get('rate') or 0 for b in security_boats)
        story.append(Paragraph(f"Security boats subtotal: {_fmt_money(total_sb)}", normal_style))

    # ── Transport ──────────────────────────────────────────────
    if vehicles:
        story.append(Paragraph(f"Transport ({len(vehicles)})", section_style))
        v_rows = [['Name', 'Type', 'Group', 'Daily Rate']]
        for v in vehicles:
            v_rows.append([
                v.get('name', ''),
                v.get('vehicle_type', ''),
                v.get('group_name', ''),
                _fmt_money(v.get('rate')),
            ])
        story.append(_section_table(v_rows, [45 * mm, 35 * mm, 40 * mm, 35 * mm], styles))
        total_veh = sum(v.get('rate') or 0 for v in vehicles)
        story.append(Paragraph(f"Transport subtotal: {_fmt_money(total_veh)}", normal_style))

    # ── Personnel / Labour ─────────────────────────────────────
    if personnel:
        story.append(Paragraph(f"Personnel ({len(personnel)})", section_style))
        p_rows = [['Name', 'Function', 'Group', 'Daily Rate']]
        for p in personnel:
            p_rows.append([
                p.get('name', ''),
                p.get('function', ''),
                p.get('group_name', ''),
                _fmt_money(p.get('rate')),
            ])
        story.append(_section_table(p_rows, [45 * mm, 40 * mm, 35 * mm, 35 * mm], styles))
        total_pers = sum(p.get('rate') or 0 for p in personnel)
        story.append(Paragraph(f"Personnel subtotal: {_fmt_money(total_pers)}", normal_style))

    # ── Guards ─────────────────────────────────────────────────
    if guards:
        story.append(Paragraph(f"Guards ({len(guards)})", section_style))
        g_rows = [['Name', 'Post', 'Shift', 'Daily Rate']]
        for gd in guards:
            g_rows.append([
                gd.get('name', ''),
                gd.get('post', ''),
                gd.get('shift', ''),
                _fmt_money(gd.get('rate')),
            ])
        story.append(_section_table(g_rows, [45 * mm, 40 * mm, 30 * mm, 35 * mm], styles))
        total_guards = sum(gd.get('rate') or 0 for gd in guards)
        story.append(Paragraph(f"Guards subtotal: {_fmt_money(total_guards)}", normal_style))

    # ── Fuel ───────────────────────────────────────────────────
    if fuel_entries:
        story.append(Paragraph(f"Fuel ({len(fuel_entries)})", section_style))
        f_rows = [['Source', 'Fuel Type', 'Liters', 'Unit Price', 'Total']]
        for f in fuel_entries:
            liters = f.get('liters') or 0
            unit_price = f.get('unit_price') or 0
            total = liters * unit_price
            f_rows.append([
                f.get('source_name', ''),
                f.get('fuel_type', 'Diesel'),
                f"{liters:.0f} L",
                _fmt_money(unit_price),
                _fmt_money(total),
            ])
        story.append(_section_table(f_rows, [40 * mm, 25 * mm, 25 * mm, 30 * mm, 30 * mm], styles))
        total_fuel = sum((f.get('liters') or 0) * (f.get('unit_price') or 0) for f in fuel_entries)
        story.append(Paragraph(f"Fuel subtotal: {_fmt_money(total_fuel)}", normal_style))

    # ── Daily Total ────────────────────────────────────────────
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph("Daily Cost Summary", section_style))

    grand_total = 0
    cost_lines = []
    for label, items, key in [
        ('Boats', boats, 'rate'),
        ('Picture Boats', picture_boats, 'rate'),
        ('Security Boats', security_boats, 'rate'),
        ('Transport', vehicles, 'rate'),
        ('Personnel', personnel, 'rate'),
        ('Guards', guards, 'rate'),
    ]:
        if items:
            subtotal = sum(i.get(key) or 0 for i in items)
            grand_total += subtotal
            cost_lines.append([label, str(len(items)), _fmt_money(subtotal)])

    if fuel_entries:
        fuel_total = sum((f.get('liters') or 0) * (f.get('unit_price') or 0) for f in fuel_entries)
        grand_total += fuel_total
        cost_lines.append(['Fuel', str(len(fuel_entries)), _fmt_money(fuel_total)])

    if cost_lines:
        summary_rows = [['Department', 'Count', 'Cost']] + cost_lines
        summary_rows.append(['TOTAL', '', _fmt_money(grand_total)])
        st = _section_table(summary_rows, [60 * mm, 30 * mm, 50 * mm], styles)
        # Bold the last row
        st.setStyle(TableStyle([
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#E8F0FE')),
        ]))
        story.append(st)

    # ── Alerts ─────────────────────────────────────────────────
    if alerts:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(f"Alerts ({len(alerts)})", section_style))
        a_rows = [['Severity', 'Type', 'Details']]
        for a in alerts[:15]:
            sev = (a.get('severity') or 'info').upper()
            atype = (a.get('type') or '').replace('_', ' ').title()
            msg = a.get('msg', '')
            a_rows.append([sev, atype, Paragraph(msg, styles['Normal'])])
        story.append(_section_table(a_rows, [22 * mm, 30 * mm, 120 * mm], styles))

    # ── Footer ─────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'],
                                  fontSize=7, textColor=colors.grey, alignment=1)
    story.append(Paragraph(
        f"Generated by ShootLogix on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        footer_style))

    doc.build(story)
    return buf.getvalue()
