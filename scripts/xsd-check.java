import javax.xml.XMLConstants;
import javax.xml.validation.SchemaFactory;
import java.io.File;

/**
 * Compiles the vendored CAP v1.2 schema so a broken XSD fails loudly instead of at
 * validation time. Run from the repo root:  java scripts/xsd-check.java
 */
public class XsdCheck {
    public static void main(String[] args) throws Exception {
        File xsd = new File("backend/common/src/main/resources/cap-v1.2.xsd");
        if (!xsd.exists()) {
            System.err.println("missing backing model: " + xsd.getPath());
            System.exit(1);
        }
        SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI).newSchema(xsd);
        System.out.println(xsd.getPath() + " compiles as a schema: OK");
    }
}
