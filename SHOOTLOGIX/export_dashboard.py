"""
export_dashboard.py — Generate a one-page PDF summary of the executive dashboard.
Uses reportlab to produce a clean, professional report.
"""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def generate_dashboard_pdf(production_name, kpis, alerts_data, burnrate):
    """Generate a one-page PDF dashboard report.

    Args:
        production_name: str
        kpis: dict with fleet_coverage, crew_coverage, unconfirmed_assignments, breakdowns
        alerts_data: dict with alerts list
        burnrate: dict with burn_data, total_spent, total_estimate, budget_consumed_pct,
                  daily_rate, projected_total, days_elapsed, days_remaining

    Returns:
        bytes — PDF content
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            topMargin=15 * mm, bottomMargin=15 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm)

    styles = getSampleStyleSheet()
    story = []

    # ── Header ──────────────────────────────────────────────────────
    header_style = ParagraphStyle('Header', parent=styles['Title'],
                                  fontSize=16, spaceAfter=2 * mm)
    sub_style = ParagraphStyle('Sub', parent=styles['Normal'],
                               fontSize=9, textColor=colors.grey, spaceAfter=6 * mm)

    story.append(Paragraph(f"ShootLogix - {production_name} - Daily Report", header_style))
    story.append(Paragraph(datetime.now().strftime("%A %d %B %Y, %H:%M"), sub_style))

    # ── KPI Cards ───────────────────────────────────────────────────
    section_style = ParagraphStyle('Section', parent=styles['Heading2'],
                                   fontSize=12, spaceBefore=4 * mm, spaceAfter=3 * mm,
                                   textColor=colors.HexColor('#1E3A5F'))

    story.append(Paragraph("Key Performance Indicators", section_style))

    fleet_cov = kpis.get('fleet_coverage', 0)
    crew_cov = kpis.get('crew_coverage', 0)
    unconfirmed = kpis.get('unconfirmed_assignments', 0)
    breakdowns = kpis.get('breakdowns', 0)

    kpi_data = [
        ['Fleet Coverage (3d)', 'Crew Coverage (3d)', 'Unconfirmed (J-2)', 'Breakdowns'],
        [f'{fleet_cov}%', f'{crew_cov}%', str(unconfirmed), str(breakdowns)],
    ]
    kpi_table = Table(kpi_data, colWidths=[45 * mm] * 4)
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 1), (-1, 1), 14),
        ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 4 * mm))

    # ── Budget Summary ──────────────────────────────────────────────
    story.append(Paragraph("Budget Summary", section_style))

    def fmt_money(n):
        if n is None:
            return '---'
        return f'${int(round(n)):,}'

    total_spent = burnrate.get('total_spent', 0)
    total_estimate = burnrate.get('total_estimate', 0)
    consumed_pct = burnrate.get('budget_consumed_pct', 0)
    daily_rate = burnrate.get('daily_rate', 0)
    projected = burnrate.get('projected_total', 0)
    days_elapsed = burnrate.get('days_elapsed', 0)
    days_remaining = burnrate.get('days_remaining', 0)

    budget_data = [
        ['Total Spent', 'Total Budget', 'Consumed', 'Daily Rate', 'Projected Total'],
        [fmt_money(total_spent), fmt_money(total_estimate), f'{consumed_pct}%',
         fmt_money(daily_rate), fmt_money(projected)],
        ['Days Elapsed', 'Days Remaining', '', '', ''],
        [str(days_elapsed), str(days_remaining), '', '', ''],
    ]
    budget_table = Table(budget_data, colWidths=[36 * mm] * 5)
    budget_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#1E3A5F')),
        ('TEXTCOLOR', (0, 2), (-1, 2), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(budget_table)
    story.append(Spacer(1, 4 * mm))

    # ── Burn Rate Table ─────────────────────────────────────────────
    burn_data = burnrate.get('burn_data', [])
    actual_days = [d for d in burn_data if d.get('is_actual')]
    if actual_days:
        story.append(Paragraph("Burn Rate (Actual Days)", section_style))

        burn_rows = [['Day', 'Date', 'Daily', 'Cumulative']]
        for d in actual_days:
            burn_rows.append([
                str(d.get('day_number', '')),
                d.get('date', ''),
                fmt_money(d.get('daily', 0)),
                fmt_money(d.get('cumulative', 0)),
            ])

        # Limit rows to keep it on one page
        if len(burn_rows) > 20:
            burn_rows = burn_rows[:18] + [['...', '...', '...', '...']] + [burn_rows[-1]]

        burn_table = Table(burn_rows, colWidths=[20 * mm, 30 * mm, 40 * mm, 40 * mm])
        burn_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (1, -1), 'CENTER'),
            ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        story.append(burn_table)
        story.append(Spacer(1, 4 * mm))

    # ── Alerts ──────────────────────────────────────────────────────
    alerts = alerts_data.get('alerts', [])
    story.append(Paragraph(f"Active Alerts ({len(alerts)})", section_style))

    if alerts:
        severity_order = {'danger': 0, 'warning': 1, 'info': 2}
        sorted_alerts = sorted(alerts, key=lambda a: severity_order.get(a.get('severity'), 9))

        alert_rows = [['Severity', 'Type', 'Details']]
        for a in sorted_alerts[:15]:
            sev = a.get('severity', 'info').upper()
            atype = a.get('type', '').replace('_', ' ').title()
            msg = a.get('msg', '')
            alert_rows.append([sev, atype, Paragraph(msg, styles['Normal'])])

        alert_table = Table(alert_rows, colWidths=[22 * mm, 30 * mm, 120 * mm])
        alert_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        story.append(alert_table)
    else:
        ok_style = ParagraphStyle('OK', parent=styles['Normal'],
                                  fontSize=9, textColor=colors.HexColor('#22C55E'))
        story.append(Paragraph("No active alerts", ok_style))

    # ── Footer ──────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'],
                                  fontSize=7, textColor=colors.grey, alignment=1)
    story.append(Paragraph(
        f"Generated by ShootLogix on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        footer_style))

    doc.build(story)
    return buf.getvalue()
