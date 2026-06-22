from pathlib import Path


def exportar_pdf(pptx_path: str) -> str:
    pptx_path = Path(pptx_path).resolve()
    pdf_path  = pptx_path.with_suffix(".pdf")

    try:
        import comtypes.client
        powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
        powerpoint.Visible = 1

        deck = powerpoint.Presentations.Open(str(pptx_path))
        deck.SaveAs(str(pdf_path), 32)
        deck.Close()
        powerpoint.Quit()

        print(f"[exportador] PDF gerado: {pdf_path}")
        return str(pdf_path)

    except Exception as e:
        print(f"[exportador] ERRO ao gerar PDF: {e}")
        return ""