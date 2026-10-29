// Decodes QR images with Apple's Vision framework and prints payload, version, level and mask per file.
import Foundation
import Vision
import CoreImage

for path in CommandLine.arguments.dropFirst() {
  let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
  let request = VNDetectBarcodesRequest()
  request.symbologies = [.qr]
  do { try handler.perform([request]) } catch {
    print("\(path)\tERROR\t\(error)")
    continue
  }
  guard let obs = request.results?.first, let payload = obs.payloadStringValue else {
    print("\(path)\tNONE")
    continue
  }
  var meta = ""
  if let d = obs.barcodeDescriptor as? CIQRCodeDescriptor {
    let level: String
    switch d.errorCorrectionLevel {
    case .levelL: level = "L"
    case .levelM: level = "M"
    case .levelQ: level = "Q"
    case .levelH: level = "H"
    @unknown default: level = "?"
    }
    meta = "\(d.symbolVersion)\t\(level)\t\(d.maskPattern)"
  }
  print("\(path)\tOK\t\(Data(payload.utf8).base64EncodedString())\t\(meta)")
}
